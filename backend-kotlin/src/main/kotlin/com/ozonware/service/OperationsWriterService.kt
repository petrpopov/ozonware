package com.ozonware.service

import com.ozonware.entity.Operation
import com.ozonware.entity.OperationItem
import com.ozonware.entity.OperationInventoryDiff
import com.ozonware.exception.BadRequestException
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.OperationInventoryDiffRepository
import com.ozonware.repository.OperationItemRepository
import com.ozonware.repository.OperationRepository
import com.ozonware.repository.OzonFboSupplyRepository
import com.ozonware.repository.OzonPostingRepository
import com.ozonware.repository.ProductRepository
import com.ozonware.repository.WriteoffRepository
import com.ozonware.repository.lookup.CorrectionReasonRepository
import com.ozonware.repository.lookup.WriteoffReasonRepository
import jakarta.persistence.EntityManager
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.LocalDate

// ── Command / Input types ────────────────────────────────────────────────────

data class RecordOperationCommand(
    val typeCode: String,
    val channelCode: String = "manual",
    val operationDate: LocalDate? = null,
    val note: String? = null,
    val items: List<ItemInput> = emptyList(),
    val diffs: List<DiffInput> = emptyList(),
    val allowShortage: Boolean = false,
    val shortageAdjustments: List<ShortageInput> = emptyList(),
    /** Если true — при нехватке автоматически компенсирует недостачу вместо 400 (только для FBS/FBO) */
    val autoCompensate: Boolean = false,
    val plannedSupplyId: Long? = null,
    val parentOperationId: Long? = null,
    val correctionReasonId: Long? = null,
) {
    data class ItemInput(
        val productId: Long,
        val quantity: Int,
        val reasonCode: String? = null,
        val note: String? = null,
        val productName: String? = null,
        val productSku: String? = null
    )
    data class DiffInput(
        val productId: Long,
        val expected: Int,
        val actual: Int,
        val productName: String? = null,
        val productSku: String? = null
    )
    data class ShortageInput(
        val productId: Long,
        val actualRemaining: Int,
        val reason: String
    )
}

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * Single write-path for all stock-mutating operations.
 * Writes to normalized tables (operation_items / operation_inventory_diffs).
 */
@Service
class OperationsWriterService(
    private val operationRepository: OperationRepository,
    private val operationItemRepository: OperationItemRepository,
    private val operationInventoryDiffRepository: OperationInventoryDiffRepository,
    private val productRepository: ProductRepository,
    private val writeoffRepository: WriteoffRepository,
    private val writeoffReasonRepository: WriteoffReasonRepository,
    private val correctionReasonRepository: CorrectionReasonRepository,
    private val ozonPostingRepository: OzonPostingRepository,
    private val ozonFboSupplyRepository: OzonFboSupplyRepository,
    private val entityManager: EntityManager,
    private val plannedSupplyService: PlannedSupplyService
) {
    companion object {
        private val log = LoggerFactory.getLogger(OperationsWriterService::class.java)
    }

    // ── Public API ────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = [Exception::class])
    fun recordOperation(cmd: RecordOperationCommand): Map<String, Any?> {
        return when (cmd.typeCode) {
            "shipment"      -> recordShipment(cmd)
            "inventory"     -> recordInventory(cmd)
            "receipt_return" -> recordSimpleOperation(cmd)
            else            -> recordSimpleOperation(cmd)
        }
    }

    @Transactional(rollbackFor = [Exception::class])
    fun updateOperation(id: Long, cmd: RecordOperationCommand): Map<String, Any?> {
        val existing = operationRepository.findById(id).orElseThrow { ResourceNotFoundException("Operation not found") }
        val parentOpId = existing.parentOperationId
        rollbackAndCleanItems(id)
        val result = when (cmd.typeCode) {
            "shipment"       -> recordShipment(cmd, existingOpId = id)
            "inventory"      -> recordInventory(cmd, existingOpId = id)
            "receipt_return" -> recordSimpleOperation(cmd, existingOpId = id)
            else             -> recordSimpleOperation(cmd, existingOpId = id)
        }
        // recordSimpleOperation already calls recalcStatus if cmd.plannedSupplyId != null.
        // For corrections (plannedSupplyId is null but linked via parent), recalc explicitly.
        if (cmd.plannedSupplyId == null && parentOpId != null) {
            operationRepository.findById(parentOpId).orElse(null)
                ?.plannedSupplyId?.let { plannedSupplyService.recalcStatus(it) }
        }
        return result
    }

    @Transactional(rollbackFor = [Exception::class])
    fun deleteOperation(id: Long) {
        val op = operationRepository.findById(id).orElseThrow { ResourceNotFoundException("Operation not found") }
        val parentOpId = op.parentOperationId
        val directSupplyId = op.plannedSupplyId
        rollbackAndCleanItems(id)
        unlinkExternalReferences(op)
        operationRepository.delete(op)
        val supplyId = directSupplyId ?: parentOpId?.let {
            operationRepository.findById(it).orElse(null)?.plannedSupplyId
        }
        supplyId?.let { plannedSupplyService.recalcStatus(it) }
    }

    @Transactional(rollbackFor = [Exception::class])
    fun bulkDelete(ids: List<Long>): Map<String, Any> {
        val ops = ids.mapNotNull { operationRepository.findById(it).orElse(null) }
        if (ops.isEmpty()) throw ResourceNotFoundException("Operations not found")
        for (op in ops) {
            rollbackAndCleanItems(op.id!!)
            unlinkExternalReferences(op)
        }
        operationRepository.deleteAllById(ids)
        return mapOf("success" to true, "deleted" to ids.size)
    }

    // ── Private builders ──────────────────────────────────────────────────────

    private fun recordSimpleOperation(
        cmd: RecordOperationCommand, existingOpId: Long? = null
    ): Map<String, Any?> {
        val op = persistOperation(
            existingOpId, cmd.typeCode, cmd.channelCode, cmd.operationDate, cmd.note ?: "",
            cmd.items.sumOf { it.quantity },
            parentOperationId = cmd.parentOperationId,
            correctionReasonId = cmd.correctionReasonId,
            plannedSupplyId = cmd.plannedSupplyId
        )
        for (input in cmd.items) {
            val product = productRepository.findById(input.productId).orElseThrow {
                ResourceNotFoundException("Product not found: ${input.productId}")
            }
            val delta = simpleDelta(cmd.typeCode, input.quantity)
            val reasonId = input.reasonCode?.let { writeoffReasonRepository.findByCode(it)?.id }

            operationItemRepository.save(OperationItem(
                operationId = op.id!!,
                productId = input.productId,
                requestedQty = BigDecimal.valueOf(input.quantity.toLong()),
                appliedQty   = BigDecimal.valueOf(input.quantity.toLong()),
                delta        = BigDecimal.valueOf(delta.toLong()),
                writeoffReasonId   = reasonId,
                writeoffReasonText = input.reasonCode,
                productNameSnapshot = input.productName ?: product.name,
                productSkuSnapshot  = input.productSku  ?: product.sku,
                itemNote = input.note
            ))

            applyDelta(input.productId, delta)

            if (cmd.typeCode == "writeoff") {
                entityManager.createNativeQuery(
                    "INSERT INTO writeoffs (product_id, operation_id, quantity, reason, note) VALUES (?, ?, ?, ?, ?)"
                ).setParameter(1, input.productId)
                    .setParameter(2, op.id)
                    .setParameter(3, input.quantity)
                    .setParameter(4, input.reasonCode ?: "")
                    .setParameter(5, input.note ?: "")
                    .executeUpdate()
            }
        }

        if (cmd.plannedSupplyId != null) {
            plannedSupplyService.recalcStatus(cmd.plannedSupplyId!!)
        } else if (cmd.parentOperationId != null) {
            operationRepository.findById(cmd.parentOperationId!!).orElse(null)
                ?.plannedSupplyId?.let { plannedSupplyService.recalcStatus(it) }
        }

        return buildResult(op)
    }

    private fun recordShipment(
        cmd: RecordOperationCommand, existingOpId: Long? = null
    ): Map<String, Any?> {
        val adjustmentMap = cmd.shortageAdjustments.associateBy { it.productId }
        val productIds = cmd.items.map { it.productId }.distinct()

        @Suppress("UNCHECKED_CAST")
        val lockedRows = entityManager.createNativeQuery(
            "SELECT id, name, sku, quantity FROM products WHERE id = ANY(?::bigint[]) FOR UPDATE"
        ).setParameter(1, productIds.toTypedArray()).resultList as List<Array<Any?>>
        val productsMap = lockedRows.associateBy { (it[0] as Number).toLong() }

        val preparedItems    = mutableListOf<Map<String, Any?>>()
        val correctionDiffs  = mutableListOf<Map<String, Any?>>()
        val autoCompensations = mutableListOf<Map<String, Any?>>()

        for (input in cmd.items) {
            val prod = productsMap[input.productId]
                ?: throw ResourceNotFoundException("Product not found: ${input.productId}")
            val avail    = (prod[3] as Number).toInt()
            val name     = prod[1] as String
            val sku      = prod[2] as String
            val reqQty   = input.quantity

            val (newQty, applied, corrDiff) = if (reqQty <= avail) {
                Triple(avail - reqQty, reqQty, null)
            } else {
                // Получаем корректировку — либо переданную вручную, либо авто при autoCompensate
                val adj = when {
                    cmd.allowShortage -> adjustmentMap[input.productId]
                        ?: throw BadRequestException("Для товара $sku не заполнена корректировка")
                    cmd.autoCompensate -> {
                        val shortfall = reqQty - avail
                        log.warn("[recordShipment] autoCompensate: $sku на складе $avail, требуется $reqQty, недостача $shortfall шт")
                        autoCompensations += mapOf(
                            "productId" to input.productId, "sku" to sku, "name" to name,
                            "qty" to shortfall,
                            "reason" to "FBS: учёт меньше фактической отгрузки OZON на $shortfall шт"
                        )
                        RecordOperationCommand.ShortageInput(
                            productId = input.productId,
                            actualRemaining = 0,
                            reason = "FBS: учёт меньше фактической отгрузки OZON на $shortfall шт"
                        )
                    }
                    else -> throw BadRequestException(
                        "Недостаточно товара $sku ($name). На складе: $avail, требуется: $reqQty"
                    )
                }
                if (adj.actualRemaining < 0 || adj.actualRemaining > avail)
                    throw BadRequestException("Некорректный фактический остаток для $sku")
                if (adj.reason.isBlank())
                    throw BadRequestException("Не указана причина корректировки для $sku")
                val expAfter  = avail - reqQty
                val corrDelta = adj.actualRemaining - expAfter
                Triple(adj.actualRemaining, avail - adj.actualRemaining, mapOf<String, Any>(
                    "productId" to input.productId, "productSKU" to sku, "productName" to name,
                    "availableBefore" to avail, "requestedQty" to reqQty,
                    "expectedAfter" to expAfter, "actualAfter" to adj.actualRemaining,
                    "correctionDelta" to corrDelta, "reason" to adj.reason
                ))
            }

            applyDelta(input.productId, newQty - avail)
            preparedItems += mapOf<String, Any?>(
                "productId" to input.productId, "productName" to (input.productName ?: name),
                "productSKU" to (input.productSku ?: sku), "quantity" to reqQty, "appliedQuantity" to applied
            )
            if (corrDiff != null) correctionDiffs += corrDiff
        }

        val op = persistOperation(
            existingOpId, "shipment", cmd.channelCode, cmd.operationDate, cmd.note ?: "",
            preparedItems.sumOf { (it["appliedQuantity"] as? Int) ?: (it["quantity"] as? Int) ?: 0 },
            plannedSupplyId = cmd.plannedSupplyId
        )

        for (item in preparedItems) {
            val pId      = (item["productId"] as Number).toLong()
            val req      = (item["quantity"] as Number).toInt()
            val app      = (item["appliedQuantity"] as? Number)?.toInt() ?: req
            operationItemRepository.save(OperationItem(
                operationId = op.id!!,
                productId = pId,
                requestedQty = BigDecimal.valueOf(req.toLong()),
                appliedQty   = BigDecimal.valueOf(app.toLong()),
                delta        = BigDecimal.valueOf(-app.toLong()),
                productNameSnapshot = item["productName"] as? String ?: "",
                productSkuSnapshot  = item["productSKU"]  as? String ?: ""
            ))
        }

        if (existingOpId != null) deleteLinkedCorrections(existingOpId)

        var correctionOperationId: Long? = null
        if (correctionDiffs.isNotEmpty()) {
            val corrReasonId = correctionReasonRepository.findByCode("post_shipment")?.id
            val corrNote = "Корректировка после отгрузки #${op.id}. " +
                    correctionDiffs.joinToString(" | ") { "${it["productSKU"]}: ${it["reason"]}" }
            val corrOp = persistOperation(
                null, "correction", cmd.channelCode, cmd.operationDate, corrNote,
                correctionDiffs.sumOf { Math.abs((it["correctionDelta"] as? Number)?.toInt() ?: 0) },
                parentOperationId = op.id, correctionReasonId = corrReasonId
            )
            for (d in correctionDiffs) {
                val pId      = (d["productId"] as Number).toLong()
                val corrDelta = (d["correctionDelta"] as? Number)?.toInt() ?: 0
                // delta = ZERO: stock was already set to actualRemaining by the shipment step;
                // correction items are audit records only — rollback must NOT double-adjust stock.
                operationItemRepository.save(OperationItem(
                    operationId = corrOp.id!!,
                    productId = pId,
                    requestedQty = BigDecimal.valueOf(Math.abs(corrDelta).toLong()),
                    appliedQty   = BigDecimal.valueOf(Math.abs(corrDelta).toLong()),
                    delta        = BigDecimal.ZERO,
                    writeoffReasonText = d["reason"] as? String,
                    productNameSnapshot = d["productName"] as? String ?: "",
                    productSkuSnapshot  = d["productSKU"]  as? String ?: ""
                ))
            }
            correctionOperationId = corrOp.id
        }

        if (cmd.plannedSupplyId != null) {
            plannedSupplyService.recalcStatus(cmd.plannedSupplyId!!)
        }

        return buildResult(op).toMutableMap().also {
            it["correction_operation_id"] = correctionOperationId
            if (autoCompensations.isNotEmpty()) it["compensations"] = autoCompensations
        }
    }

    private fun recordInventory(
        cmd: RecordOperationCommand, existingOpId: Long? = null
    ): Map<String, Any?> {
        val op = persistOperation(
            existingOpId, "inventory", cmd.channelCode, cmd.operationDate, cmd.note ?: "",
            cmd.diffs.size
        )
        existingOpId?.let { operationInventoryDiffRepository.deleteAllByOperationId(it) }

        for (d in cmd.diffs) {
            @Suppress("UNCHECKED_CAST")
            val lockedRows = entityManager.createNativeQuery(
                "SELECT id, name, sku, quantity FROM products WHERE id = ? FOR UPDATE"
            ).setParameter(1, d.productId).resultList as List<Array<Any?>>
            val locked = lockedRows.firstOrNull()
                ?: throw ResourceNotFoundException("Product not found: ${d.productId}")
            val dbExpected = (locked[3] as Number).toInt()
            val dbName = locked[1] as? String ?: ""
            val dbSku = locked[2] as? String ?: ""

            operationInventoryDiffRepository.save(OperationInventoryDiff(
                operationId = op.id!!,
                productId = d.productId,
                expected = BigDecimal.valueOf(dbExpected.toLong()),
                actual   = BigDecimal.valueOf(d.actual.toLong()),
                productNameSnapshot = d.productName ?: dbName,
                productSkuSnapshot  = d.productSku  ?: dbSku
            ))
            entityManager.createNativeQuery(
                "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?"
            ).setParameter(1, d.actual).setParameter(2, d.productId).executeUpdate()
        }
        return buildResult(op)
    }

    // ── Rollback / clean ──────────────────────────────────────────────────────

    private fun rollbackAndCleanItems(opId: Long) {
        // Rollback from normalized items
        val items = operationItemRepository.findAllByOperationId(opId)
        for (item in items) {
            val reverse = -(item.delta?.toLong() ?: 0L)
            if (reverse != 0L) {
                entityManager.createNativeQuery(
                    "UPDATE products SET quantity = GREATEST(0, quantity + ?), updated_at = NOW() WHERE id = ?"
                ).setParameter(1, reverse).setParameter(2, item.productId).executeUpdate()
            }
        }
        operationItemRepository.deleteAllByOperationId(opId)

        // Rollback inventory diffs (restore expected quantities)
        val diffs = operationInventoryDiffRepository.findAllByOperationId(opId)
        for (d in diffs) {
            entityManager.createNativeQuery(
                "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?"
            ).setParameter(1, d.expected.toLong()).setParameter(2, d.productId).executeUpdate()
        }
        operationInventoryDiffRepository.deleteAllByOperationId(opId)

        deleteLinkedCorrections(opId)
    }

    private fun deleteLinkedCorrections(parentId: Long) {
        val corrections = operationRepository.findByParentOperationId(parentId)
        for (c in corrections) {
            rollbackAndCleanItems(c.id!!)
            operationRepository.delete(c)
        }
        entityManager.createNativeQuery(
            "DELETE FROM operations WHERE type_code = 'correction' AND note LIKE ?"
        ).setParameter(1, "Корректировка после отгрузки #${parentId}.%").executeUpdate()
    }

    private fun unlinkExternalReferences(op: Operation) {
        if (op.channelCode == "ozon_fbs" || op.note?.startsWith("OZON FBS") == true) {
            ozonPostingRepository.clearShipmentFlagsByOperationId(op.id!!)
        }
        if (op.channelCode == "ozon_fbo" || op.note?.startsWith("OZON FBO") == true) {
            ozonFboSupplyRepository.clearShipmentFlagsByOperationId(op.id!!)
        }
    }

    // ── Persistence helpers ───────────────────────────────────────────────────

    private fun persistOperation(
        existingId: Long?,
        typeCode: String,
        channelCode: String,
        operationDate: LocalDate?,
        note: String,
        totalQuantity: Int,
        parentOperationId: Long? = null,
        correctionReasonId: Long? = null,
        plannedSupplyId: Long? = null
    ): Operation {
        return if (existingId != null) {
            val op = operationRepository.findById(existingId).get()
            op.typeCode = typeCode
            op.channelCode = channelCode
            op.parentOperationId = parentOperationId
            op.correctionReasonId = correctionReasonId
            op.operationDate = operationDate
            op.note = note
            op.totalQuantity = totalQuantity
            op.plannedSupplyId = plannedSupplyId
            operationRepository.save(op)
        } else {
            operationRepository.save(Operation(
                typeCode = typeCode, channelCode = channelCode,
                parentOperationId = parentOperationId, correctionReasonId = correctionReasonId,
                operationDate = operationDate, note = note, totalQuantity = totalQuantity,
                plannedSupplyId = plannedSupplyId
            ))
        }
    }

    private fun applyDelta(productId: Long, delta: Int) {
        if (delta == 0) return
        entityManager.createNativeQuery(
            "UPDATE products SET quantity = quantity + ?, updated_at = NOW() WHERE id = ?"
        ).setParameter(1, delta).setParameter(2, productId).executeUpdate()
        // Warn on negative — should not happen with correct data, but is recoverable
        val newQty = entityManager.createNativeQuery(
            "SELECT quantity FROM products WHERE id = ?"
        ).setParameter(1, productId).singleResult as Int
        if (newQty < 0) {
            log.warn("[applyDelta] product $productId quantity went negative: $newQty (delta=$delta)")
        }
    }

    private fun simpleDelta(typeCode: String, qty: Int) = when (typeCode) {
        "receipt"        ->  qty
        "shipment"       -> -qty
        "writeoff"       -> -qty
        "correction"     ->  qty
        "receipt_return" -> -qty
        else             ->  0
    }

    private fun buildResult(op: Operation): Map<String, Any?> {
        val fresh = operationRepository.findById(op.id!!).get()

        return mapOf(
            "id" to fresh.id, "type_code" to fresh.typeCode,
            "channel_code" to fresh.channelCode, "operation_date" to fresh.operationDate?.toString(),
            "note" to fresh.note,
            "items" to buildItemsForResponse(fresh.id!!),
            "total_quantity" to fresh.totalQuantity,
            "differences" to buildDiffsForResponse(fresh.id, fresh.typeCode),
            "planned_supply_id" to fresh.plannedSupplyId,
            "created_at" to fresh.createdAt?.toString(),
            "updated_at" to fresh.updatedAt?.toString()
        )
    }

    private fun buildItemsForResponse(operationId: Long): List<Map<String, Any?>> =
        operationItemRepository.findAllByOperationId(operationId).map { item ->
            mapOf(
                "productId" to item.productId,
                "productName" to item.productNameSnapshot,
                "productSKU" to item.productSkuSnapshot,
                "quantity" to item.requestedQty.toInt(),
                "reason" to item.writeoffReasonText,
                "note" to item.itemNote,
                "delta" to item.delta
            )
        }

    private fun buildDiffsForResponse(operationId: Long, typeCode: String?): List<Map<String, Any?>> {
        if (typeCode != "inventory") return emptyList()
        return operationInventoryDiffRepository.findAllByOperationId(operationId).map { d ->
            mapOf(
                "productId" to d.productId,
                "productSKU" to d.productSkuSnapshot,
                "productName" to d.productNameSnapshot,
                "correctionDelta" to d.diff,
                "availableBefore" to d.expected,
                "requestedQty" to maxOf(BigDecimal.ZERO, d.expected.subtract(d.actual)),
                "actualAfter" to d.actual
            )
        }
    }
}
