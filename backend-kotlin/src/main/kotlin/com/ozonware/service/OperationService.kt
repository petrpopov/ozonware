package com.ozonware.service

import com.ozonware.entity.Operation
import com.ozonware.exception.BadRequestException
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.OperationInventoryDiffRepository
import com.ozonware.repository.OperationItemRepository
import com.ozonware.repository.OperationRepository
import jakarta.persistence.EntityManager
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.LocalDate

@Service
class OperationService(
    private val operationRepository: OperationRepository,
    private val operationsWriterService: OperationsWriterService,
    private val operationItemRepository: OperationItemRepository,
    private val operationInventoryDiffRepository: OperationInventoryDiffRepository,
    private val entityManager: EntityManager
) {

    fun findAll(
        type: String? = null,
        limit: String? = null,
        offset: String? = null,
        includeTotal: Boolean = false,
        shipmentKind: String? = null
    ): Any {
        val whereParts = mutableListOf<String>()
        val params = mutableListOf<Any>()

        if (type != null) {
            whereParts += "type_code = ?"
            params += type
        }

        val sk = shipmentKind?.lowercase()
        if (type == "shipment" && sk in listOf("fbs", "fbo", "manual")) {
            when (sk) {
                "fbs"    -> { whereParts += "channel_code = ?"; params += "ozon_fbs" }
                "fbo"    -> { whereParts += "channel_code = ?"; params += "ozon_fbo" }
                "manual" -> { whereParts += "channel_code = ?"; params += "manual"   }
            }
        }

        val whereClause = if (whereParts.isNotEmpty()) "WHERE " + whereParts.joinToString(" AND ") else ""
        val parsedLimit = limit?.lowercase()?.let { if (it == "all") null else it.toIntOrNull() }
        val parsedOffset = offset?.toIntOrNull() ?: 0
        val safeOffset = if (parsedOffset > 0) parsedOffset else 0
        val usePagination = parsedLimit != null && parsedLimit > 0

        val queryStr = "SELECT * FROM operations $whereClause ORDER BY created_at DESC" +
                if (usePagination) " LIMIT ? OFFSET ?" else ""

        val queryParams = params.toMutableList()
        if (usePagination) { queryParams += parsedLimit!!; queryParams += safeOffset }

        val nativeQuery = entityManager.createNativeQuery(queryStr, Operation::class.java)
        queryParams.forEachIndexed { i, p -> nativeQuery.setParameter(i + 1, p) }

        @Suppress("UNCHECKED_CAST")
        val results = nativeQuery.resultList as List<Operation>

        if (!includeTotal) return results.map { operationToMap(it) }

        val countStr = "SELECT COUNT(*)::int AS total FROM operations $whereClause"
        val countQuery = entityManager.createNativeQuery(countStr)
        params.forEachIndexed { i, p -> countQuery.setParameter(i + 1, p) }
        val total = (countQuery.singleResult as Number).toInt()

        return mapOf(
            "items" to results.map { operationToMap(it) },
            "total" to total,
            "limit" to if (usePagination) parsedLimit else null,
            "offset" to if (usePagination) safeOffset else 0
        )
    }

    fun findById(id: Long): Map<String, Any?> {
        val op = operationRepository.findById(id).orElseThrow { ResourceNotFoundException("Operation not found") }
        return operationToMap(op)
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
        shortageAdjustments: List<Map<String, Any?>>?
    ): Map<String, Any?> {
        val validTypes = listOf("receipt", "shipment", "inventory", "writeoff", "correction")
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
            shortageAdjustments = shortageAdjustments?.mapNotNull { toShortageInput(it) } ?: emptyList()
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
        shortageAdjustments: List<Map<String, Any?>>?
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
            shortageAdjustments = shortageAdjustments?.mapNotNull { toShortageInput(it) } ?: emptyList()
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
        return RecordOperationCommand.ItemInput(
            productId = productId,
            quantity = (item["quantity"] as? Number)?.toInt() ?: 0,
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
