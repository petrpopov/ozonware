package com.ozonware.service

import com.ozonware.entity.Operation
import com.ozonware.exception.BadRequestException
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.OperationInventoryDiffRepository
import com.ozonware.repository.OperationItemRepository
import com.ozonware.repository.OperationRepository
import io.github.perplexhub.rsql.RSQLJPASupport
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.LocalDate

/** Warehouse operation service — paginated list with RSQL filtering, transactional create/update/delete. */
@Service
class OperationService(
    private val operationRepository: OperationRepository,
    private val operationsWriterService: OperationsWriterService,
    private val operationItemRepository: OperationItemRepository,
    private val operationInventoryDiffRepository: OperationInventoryDiffRepository
) {

    fun findAll(filter: String?, pageable: Pageable): Map<String, Any?> {
        val spec: Specification<Operation>? = filter?.let { RSQLJPASupport.toSpecification(it) }
        val page = if (spec != null)
            operationRepository.findAll(spec, pageable)
        else
            operationRepository.findAll(pageable)

        return mapOf(
            "items"  to page.content.map { operationToMap(it) },
            "total"  to page.totalElements.toInt(),
            "limit"  to pageable.pageSize,
            "offset" to (pageable.pageNumber * pageable.pageSize)
        )
    }

    fun findById(id: Long): Map<String, Any?> {
        val op = operationRepository.findById(id).orElseThrow { ResourceNotFoundException("Operation not found") }
        val corrections = operationRepository.findByParentOperationId(id)

        return operationToMap(op) + mapOf(
            "planned_supply_id" to op.plannedSupplyId,
            "corrections" to corrections.map { corr ->
                mapOf(
                    "id" to corr.id,
                    "type_code" to corr.typeCode,
                    "operation_date" to corr.operationDate?.toString(),
                    "total_quantity" to corr.totalQuantity,
                    "note" to corr.note,
                    "correction_reason_id" to corr.correctionReasonId
                )
            }
        )
    }

    @Transactional(rollbackFor = [Exception::class])
    fun createOperation(
        type: String,
        operationDate: String?,
        note: String?,
        items: List<Map<String, Any?>>?,
        totalQuantity: Int?,
        differences: List<Map<String, Any?>>?,
        allowShortage: Boolean?,
        shortageAdjustments: List<Map<String, Any?>>?,
        plannedSupplyId: Long? = null,
        parentOperationId: Long? = null,
        correctionReasonId: Long? = null
    ): Map<String, Any?> {
        val validTypes = listOf("receipt", "shipment", "inventory", "writeoff", "correction", "receipt_return")
        if (type !in validTypes) throw BadRequestException("Invalid operation type")

        val channelCode = when {
            note?.startsWith("OZON FBS") == true -> "ozon_fbs"
            note?.startsWith("OZON FBO") == true -> "ozon_fbo"
            else -> "manual"
        }

        val cmd = RecordOperationCommand(
            typeCode = type,
            channelCode = channelCode,
            operationDate = operationDate?.let { LocalDate.parse(it) },
            note = note,
            items = items?.mapNotNull { toItemInput(it) } ?: emptyList(),
            diffs = differences?.mapNotNull { toDiffInput(it) } ?: emptyList(),
            allowShortage = allowShortage ?: false,
            shortageAdjustments = shortageAdjustments?.mapNotNull { toShortageInput(it) } ?: emptyList(),
            plannedSupplyId = plannedSupplyId,
            parentOperationId = parentOperationId,
            correctionReasonId = correctionReasonId
        )

        return operationsWriterService.recordOperation(cmd)
    }

    @Transactional(rollbackFor = [Exception::class])
    fun updateOperation(
        id: Long,
        operationDate: String?,
        note: String?,
        items: List<Map<String, Any?>>?,
        totalQuantity: Int?,
        differences: List<Map<String, Any?>>?,
        allowShortage: Boolean?,
        shortageAdjustments: List<Map<String, Any?>>?,
        correctionReasonId: Long? = null
    ): Map<String, Any?> {
        val existing = operationRepository.findById(id).orElseThrow { ResourceNotFoundException("Operation not found") }
        val channelCode = when {
            note?.startsWith("OZON FBS") == true -> "ozon_fbs"
            note?.startsWith("OZON FBO") == true -> "ozon_fbo"
            else -> existing.channelCode
        }

        val cmd = RecordOperationCommand(
            typeCode = existing.typeCode,
            channelCode = channelCode,
            operationDate = operationDate?.let { LocalDate.parse(it) },
            note = note,
            items = items?.mapNotNull { toItemInput(it) } ?: emptyList(),
            diffs = differences?.mapNotNull { toDiffInput(it) } ?: emptyList(),
            allowShortage = allowShortage ?: false,
            shortageAdjustments = shortageAdjustments?.mapNotNull { toShortageInput(it) } ?: emptyList(),
            parentOperationId = existing.parentOperationId,
            plannedSupplyId = existing.plannedSupplyId,
            correctionReasonId = correctionReasonId ?: existing.correctionReasonId
        )
        return operationsWriterService.updateOperation(id, cmd)
    }

    @Transactional(rollbackFor = [Exception::class])
    fun deleteOperation(id: Long) = operationsWriterService.deleteOperation(id)

    @Transactional(rollbackFor = [Exception::class])
    fun bulkDeleteOperations(ids: List<Long>): Map<String, Any> = operationsWriterService.bulkDelete(ids)

    // ── Converters ────────────────────────────────────────────────────────────

    private fun toItemInput(item: Map<String, Any?>): RecordOperationCommand.ItemInput? {
        val productId = (item["productId"] as? Number)?.toLong() ?: return null
        val quantity = (item["quantity"] as? Number)?.toInt() ?: 0
        if (quantity <= 0) throw BadRequestException("Quantity must be a positive integer for product $productId")

        return RecordOperationCommand.ItemInput(
            productId = productId,
            quantity = quantity,
            reasonCode = item["reason"] as? String,
            note = item["note"] as? String,
            productName = item["productName"] as? String,
            productSku = (item["productSKU"] as? String) ?: (item["productSku"] as? String)
        )
    }

    private fun toDiffInput(diff: Map<String, Any?>): RecordOperationCommand.DiffInput? {
        val productId = (diff["productId"] as? Number)?.toLong() ?: return null
        val actual = (diff["actual"] as? Number)?.toInt()
            ?: throw BadRequestException("Invalid actual quantity for product $productId: ${diff["actual"]}")
        return RecordOperationCommand.DiffInput(
            productId = productId,
            expected = (diff["expected"] as? Number)?.toInt() ?: 0,
            actual = actual,
            productName = diff["productName"] as? String,
            productSku = (diff["sku"] as? String) ?: (diff["productSku"] as? String)
        )
    }

    private fun toShortageInput(adj: Map<String, Any?>): RecordOperationCommand.ShortageInput? {
        val productId = (adj["productId"] as? Number)?.toLong() ?: return null
        return RecordOperationCommand.ShortageInput(
            productId = productId,
            actualRemaining = (adj["actual_remaining"] as? Number)?.toInt() ?: 0,
            reason = adj["reason"] as? String ?: ""
        )
    }

    private fun operationToMap(op: Operation): Map<String, Any?> = mapOf(
        "id" to op.id,
        "type_code" to op.typeCode,
        "channel_code" to op.channelCode,
        "operation_date" to op.operationDate?.toString(),
        "note" to op.note,
        "items" to buildItemsForResponse(op.id!!),
        "total_quantity" to op.totalQuantity,
        "differences" to buildDiffsForResponse(op.id, op.typeCode),
        "planned_supply_id" to op.plannedSupplyId,
        "parent_operation_id" to op.parentOperationId,
        "created_at" to op.createdAt?.toString(),
        "updated_at" to op.updatedAt?.toString()
    )

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
