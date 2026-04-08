package com.ozonware.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.ozonware.entity.Operation
import com.ozonware.entity.Product
import com.ozonware.entity.Writeoff
import com.ozonware.exception.BadRequestException
import com.ozonware.exception.ConflictException
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.OperationRepository
import com.ozonware.repository.OzonFboSupplyRepository
import com.ozonware.repository.OzonPostingRepository
import com.ozonware.repository.ProductRepository
import com.ozonware.repository.WriteoffRepository
import jakarta.persistence.EntityManager
import org.slf4j.LoggerFactory
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class OperationService(
    private val operationRepository: OperationRepository,
    private val productRepository: ProductRepository,
    private val writeoffRepository: WriteoffRepository,
    private val ozonPostingRepository: OzonPostingRepository,
    private val ozonFboSupplyRepository: OzonFboSupplyRepository,
    private val entityManager: EntityManager,
    private val objectMapper: ObjectMapper
) {

    private val log = LoggerFactory.getLogger(OperationService::class.java)

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
            whereParts += "o.type = ?"
            params += type
        }

        val sk = shipmentKind?.lowercase()
        if (type == "shipment" && sk in listOf("fbs", "fbo", "manual")) {
            when (sk) {
                "fbs" -> {
                    whereParts += "o.note ILIKE ?"
                    params += "OZON FBS%"
                }
                "fbo" -> {
                    whereParts += "o.note ILIKE ?"
                    params += "OZON FBO%"
                }
                "manual" -> {
                    whereParts += "(o.note IS NULL OR (o.note NOT ILIKE ? AND o.note NOT ILIKE ?))"
                    params += "OZON FBS%"
                    params += "OZON FBO%"
                }
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
        if (usePagination) {
            queryParams += parsedLimit!!
            queryParams += safeOffset
        }

        val nativeQuery = entityManager.createNativeQuery(queryStr, Operation::class.java)
        queryParams.forEachIndexed { i, p -> nativeQuery.setParameter(i + 1, p) }

        @Suppress("UNCHECKED_CAST")
        val results = nativeQuery.resultList as List<Operation>

        if (!includeTotal) {
            return results.map { operationToMap(it) }
        }

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
        val op = operationRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Operation not found")
        }
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
        if (type !in validTypes) {
            throw BadRequestException("Invalid operation type")
        }

        val parsedDate = operationDate?.let { java.time.LocalDate.parse(it) }

        if (type == "shipment" && !items.isNullOrEmpty()) {
            return createShipmentWithShortage(
                parsedDate, note, items, allowShortage ?: false, shortageAdjustments ?: emptyList()
            )
        }

        val op = Operation(
            type = type,
            operationDate = parsedDate,
            note = note ?: "",
            items = items ?: emptyList(),
            totalQuantity = totalQuantity ?: 0,
            differences = differences ?: emptyList()
        )
        operationRepository.save(op)

        log.info("Processing operation type: $type")
        log.info("Items count: ${items?.size ?: 0}")
        log.info("Differences count: ${differences?.size ?: 0}")

        if (type in listOf("receipt", "shipment", "correction") && !items.isNullOrEmpty()) {
            log.info("Updating quantities for $type")
            for (item in items) {
                val quantityChange = getApplyQuantityChange(type, item)
                if (quantityChange == 0) continue
                log.info("Product ${item["productId"]}: changing by $quantityChange")
                entityManager.createNativeQuery(
                    "UPDATE products SET quantity = GREATEST(0, quantity + ?), updated_at = NOW() WHERE id = ?"
                ).setParameter(1, quantityChange).setParameter(2, item["productId"]).executeUpdate()
            }
        }

        if (type == "inventory" && !differences.isNullOrEmpty()) {
            log.info("Processing inventory differences for ${differences.size} products")
            for (diff in differences) {
                val actualQuantity = (diff["actual"] as? Number)?.toInt()
                    ?: throw BadRequestException("Invalid actual quantity for product ${diff["productId"]}: ${diff["actual"]}")
                log.info("Product ${diff["productId"]}: setting to $actualQuantity (was ${diff["expected"]})")
                entityManager.createNativeQuery(
                    "UPDATE products SET quantity = ? WHERE id = ?"
                ).setParameter(1, actualQuantity).setParameter(2, diff["productId"]).executeUpdate()
            }
        } else if (type == "inventory") {
            log.info("Inventory has no differences - no updates needed")
        }

        if (type == "writeoff" && !items.isNullOrEmpty()) {
            log.info("Processing writeoff for ${items.size} items")
            for (item in items) {
                val productId = item["productId"]
                val qty = (item["quantity"] as? Number)?.toInt() ?: 0
                entityManager.createNativeQuery(
                    "UPDATE products SET quantity = quantity - ? WHERE id = ?"
                ).setParameter(1, qty).setParameter(2, productId).executeUpdate()

                entityManager.createNativeQuery(
                    "INSERT INTO writeoffs (product_id, operation_id, quantity, reason, note) VALUES (?, ?, ?, ?, ?)"
                ).setParameter(1, productId)
                    .setParameter(2, op.id)
                    .setParameter(3, qty)
                    .setParameter(4, item["reason"] ?: "")
                    .setParameter(5, item["note"] ?: "")
                    .executeUpdate()

                log.info("Product $productId: writeoff $qty (reason: ${item["reason"]})")
            }
        }

        return operationToMap(operationRepository.findById(op.id!!).get())
    }

    private fun createShipmentWithShortage(
        operationDate: java.time.LocalDate?,
        note: String?,
        items: List<Map<String, Any?>>,
        allowShortage: Boolean,
        shortageAdjustments: List<Map<String, Any?>>
    ): Map<String, Any?> {
        val productIds = items.mapNotNull { (it["productId"] as? Number)?.toLong() }.distinct()
        val adjustmentMap = shortageAdjustments.associate {
            ((it["productId"] as? Number)?.toLong() ?: -1L) to it
        }

        val productsResult = entityManager.createNativeQuery(
            "SELECT id, name, sku, quantity FROM products WHERE id = ANY(?::bigint[]) FOR UPDATE"
        ).setParameter(1, productIds.toTypedArray())

        @Suppress("UNCHECKED_CAST")
        val products = productsResult.resultList as List<Array<Any?>>
        val productsMap = products.associateBy { (it[0] as Number).toLong() }

        val preparedItems = mutableListOf<Map<String, Any?>>()
        val correctionDiffs = mutableListOf<Map<String, Any?>>()

        for (item in items) {
            val productId = (item["productId"] as? Number)?.toLong()
                ?: throw BadRequestException("Invalid shipment item")
            val requestQty = getItemQuantity(item)
            if (requestQty <= 0) throw BadRequestException("Invalid shipment item")

            val prod = productsMap[productId]
                ?: throw ResourceNotFoundException("Product not found: $productId")

            val availableBefore = (prod[3] as Number).toInt()
            val prodName = prod[1] as String
            val prodSku = prod[2] as String

            val (newQty, appliedQty, correctionDiff) = if (requestQty <= availableBefore) {
                Triple(availableBefore - requestQty, requestQty, null)
            } else {
                if (!allowShortage) {
                    throw BadRequestException(
                        "Недостаточно товара $prodSku ($prodName). На складе: $availableBefore, требуется: $requestQty, не хватает: ${requestQty - availableBefore}"
                    )
                }

                val adjustment = adjustmentMap[productId]
                    ?: throw BadRequestException("Для товара $prodSku не заполнена корректировка")

                val actualRemaining = (adjustment["actual_remaining"] as? Number)?.toInt()
                    ?: throw BadRequestException("Некорректный фактический остаток для $prodSku")

                if (actualRemaining < 0) {
                    throw BadRequestException("Некорректный фактический остаток для $prodSku")
                }
                if (actualRemaining > availableBefore) {
                    throw BadRequestException("Фактический остаток для $prodSku не может быть больше текущего")
                }

                val reason = adjustment["reason"] as? String
                if (reason.isNullOrBlank()) {
                    throw BadRequestException("Не указана причина корректировки для $prodSku")
                }

                val expectedAfter = availableBefore - requestQty
                val correctionDelta = actualRemaining - expectedAfter

                val diff = mapOf<String, Any>(
                    "productId" to productId,
                    "productSKU" to prodSku,
                    "productName" to prodName,
                    "availableBefore" to availableBefore,
                    "requestedQty" to requestQty,
                    "expectedAfter" to expectedAfter,
                    "actualAfter" to actualRemaining,
                    "correctionDelta" to correctionDelta,
                    "reason" to reason
                )

                Triple(actualRemaining, availableBefore - actualRemaining, diff)
            }

            entityManager.createNativeQuery(
                "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?"
            ).setParameter(1, newQty).setParameter(2, productId).executeUpdate()

            preparedItems += mapOf<String, Any?>(
                "productId" to productId,
                "productName" to item["productName"] ?: prodName,
                "productSKU" to item["productSKU"] ?: prodSku,
                "quantity" to requestQty,
                "appliedQuantity" to appliedQty
            )

            if (correctionDiff != null) {
                correctionDiffs += correctionDiff
            }
        }

        val shipmentTotalQty = preparedItems.sumOf { getItemQuantity(it) }
        val shipmentResult = entityManager.createNativeQuery(
            """INSERT INTO operations (type, operation_date, note, items, total_quantity, differences)
               VALUES (?, ?, ?, ?::jsonb, ?, ?::jsonb) RETURNING *""",
            Operation::class.java
        ).setParameter(1, "shipment")
            .setParameter(2, operationDate)
            .setParameter(3, note ?: "")
            .setParameter(4, objectMapper.writeValueAsString(preparedItems))
            .setParameter(5, shipmentTotalQty)
            .setParameter(6, objectMapper.writeValueAsString(emptyList<Map<String, Any?>>()))

        @Suppress("UNCHECKED_CAST")
        val shipmentOp = (shipmentResult.resultList as List<Operation>).first()

        var correctionOperationId: Long? = null
        if (correctionDiffs.isNotEmpty()) {
            val correctionTotal = correctionDiffs.sumOf {
                kotlin.math.abs((it["correctionDelta"] as? Number)?.toInt() ?: 0)
            }
            val correctionNote = "Корректировка после отгрузки #${shipmentOp.id}. " +
                    correctionDiffs.joinToString(" | ") { "${it["productSKU"]}: ${it["reason"]}" }

            val correctionResult = entityManager.createNativeQuery(
                """INSERT INTO operations (type, operation_date, note, items, total_quantity, differences)
                   VALUES (?, ?, ?, ?::jsonb, ?, ?::jsonb) RETURNING *""",
                Operation::class.java
            ).setParameter(1, "correction")
                .setParameter(2, operationDate)
                .setParameter(3, correctionNote)
                .setParameter(4, objectMapper.writeValueAsString(emptyList<Map<String, Any?>>()))
                .setParameter(5, correctionTotal)
                .setParameter(6, objectMapper.writeValueAsString(correctionDiffs))

            @Suppress("UNCHECKED_CAST")
            val correctionOp = (correctionResult.resultList as List<Operation>).first()
            correctionOperationId = correctionOp.id
        }

        val refreshedOp = operationRepository.findById(shipmentOp.id!!).get()
        return operationToMap(refreshedOp) + ("correction_operation_id" to correctionOperationId)
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
        val oldOp = operationRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Operation not found")
        }

        // Rollback old quantities
        if (oldOp.items.isNotEmpty()) {
            for (item in oldOp.items) {
                val quantityChange = getRollbackQuantityChange(oldOp.type, item)
                if (quantityChange == 0) continue
                entityManager.createNativeQuery(
                    "UPDATE products SET quantity = GREATEST(0, quantity + ?) WHERE id = ?"
                ).setParameter(1, quantityChange).setParameter(2, item["productId"]).executeUpdate()
            }
        }

        if (oldOp.type == "shipment") {
            return updateShipmentWithShortage(
                oldOp, operationDate, note, items ?: emptyList(),
                totalQuantity, allowShortage ?: false, shortageAdjustments ?: emptyList()
            )
        }

        oldOp.operationDate = operationDate?.let { java.time.LocalDate.parse(it) }
        oldOp.note = note
        oldOp.items = items ?: emptyList()
        oldOp.totalQuantity = totalQuantity ?: 0
        oldOp.differences = differences ?: emptyList()
        operationRepository.save(oldOp)

        // Apply new quantities
        if (!items.isNullOrEmpty()) {
            for (item in items) {
                val quantityChange = getApplyQuantityChange(oldOp.type, item)
                if (quantityChange == 0) continue
                entityManager.createNativeQuery(
                    "UPDATE products SET quantity = GREATEST(0, quantity + ?), updated_at = NOW() WHERE id = ?"
                ).setParameter(1, quantityChange).setParameter(2, item["productId"]).executeUpdate()
            }
        }

        return operationToMap(operationRepository.findById(id).get())
    }

    private fun updateShipmentWithShortage(
        oldOp: Operation,
        operationDate: String?,
        note: String?,
        items: List<Map<String, Any?>>,
        totalQuantity: Int?,
        allowShortage: Boolean,
        shortageAdjustments: List<Map<String, Any?>>
    ): Map<String, Any?> {
        val productIds = items.mapNotNull { (it["productId"] as? Number)?.toLong() }.distinct()
        val adjustmentMap = shortageAdjustments.associate {
            ((it["productId"] as? Number)?.toLong() ?: -1L) to it
        }

        val productsResult = entityManager.createNativeQuery(
            "SELECT id, name, sku, quantity FROM products WHERE id = ANY(?::bigint[]) FOR UPDATE"
        ).setParameter(1, productIds.toTypedArray())

        @Suppress("UNCHECKED_CAST")
        val products = productsResult.resultList as List<Array<Any?>>
        val productsMap = products.associateBy { (it[0] as Number).toLong() }

        val preparedItems = mutableListOf<Map<String, Any?>>()
        val correctionDiffs = mutableListOf<Map<String, Any?>>()

        for (item in items) {
            val productId = (item["productId"] as? Number)?.toLong()
                ?: throw BadRequestException("Invalid shipment item")
            val requestQty = getItemQuantity(item)
            if (requestQty <= 0) throw BadRequestException("Invalid shipment item")

            val prod = productsMap[productId]
                ?: throw ResourceNotFoundException("Product not found: $productId")

            val availableBefore = (prod[3] as Number).toInt()
            val prodName = prod[1] as String
            val prodSku = prod[2] as String

            val (newQty, appliedQty, correctionDiff) = if (requestQty <= availableBefore) {
                Triple(availableBefore - requestQty, requestQty, null)
            } else {
                if (!allowShortage) {
                    throw BadRequestException(
                        "Недостаточно товара $prodSku ($prodName). На складе: $availableBefore, требуется: $requestQty, не хватает: ${requestQty - availableBefore}"
                    )
                }

                val adjustment = adjustmentMap[productId]
                    ?: throw BadRequestException("Для товара $prodSku не заполнена корректировка")

                val actualRemaining = (adjustment["actual_remaining"] as? Number)?.toInt()
                    ?: throw BadRequestException("Некорректный фактический остаток для $prodSku")
                if (actualRemaining < 0) throw BadRequestException("Некорректный фактический остаток для $prodSku")
                if (actualRemaining > availableBefore) throw BadRequestException("Фактический остаток для $prodSku не может быть больше текущего")

                val reason = adjustment["reason"] as? String
                if (reason.isNullOrBlank()) throw BadRequestException("Не указана причина корректировки для $prodSku")

                val expectedAfter = availableBefore - requestQty
                val correctionDelta = actualRemaining - expectedAfter

                Triple(actualRemaining, availableBefore - actualRemaining, mapOf<String, Any>(
                    "productId" to productId, "productSKU" to prodSku, "productName" to prodName,
                    "availableBefore" to availableBefore, "requestedQty" to requestQty,
                    "expectedAfter" to expectedAfter, "actualAfter" to actualRemaining,
                    "correctionDelta" to correctionDelta, "reason" to reason
                ))
            }

            entityManager.createNativeQuery(
                "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?"
            ).setParameter(1, newQty).setParameter(2, productId).executeUpdate()

            preparedItems += mapOf<String, Any?>(
                "productId" to productId,
                "productName" to item["productName"] ?: prodName,
                "productSKU" to item["productSKU"] ?: prodSku,
                "quantity" to requestQty,
                "appliedQuantity" to appliedQty
            )
            if (correctionDiff != null) correctionDiffs += correctionDiff
        }

        entityManager.createNativeQuery(
            "UPDATE operations SET operation_date = ?, note = ?, items = ?::jsonb, total_quantity = ?, differences = ?::jsonb, updated_at = NOW() WHERE id = ?"
        ).setParameter(1, operationDate?.let { java.time.LocalDate.parse(it) })
            .setParameter(2, note)
            .setParameter(3, objectMapper.writeValueAsString(preparedItems))
            .setParameter(4, totalQuantity ?: preparedItems.sumOf { getItemQuantity(it) })
            .setParameter(5, objectMapper.writeValueAsString(emptyList<Map<String, Any?>>()))
            .setParameter(6, oldOp.id)
            .executeUpdate()

        // Delete old correction
        entityManager.createNativeQuery(
            "DELETE FROM operations WHERE type = 'correction' AND note LIKE ?"
        ).setParameter(1, "Корректировка после отгрузки #${oldOp.id}.%").executeUpdate()

        var correctionOperationId: Long? = null
        if (correctionDiffs.isNotEmpty()) {
            val correctionTotal = correctionDiffs.sumOf { kotlin.math.abs((it["correctionDelta"] as? Number)?.toInt() ?: 0) }
            val correctionNote = "Корректировка после отгрузки #${oldOp.id}. " +
                    correctionDiffs.joinToString(" | ") { "${it["productSKU"]}: ${it["reason"]}" }

            val correctionResult = entityManager.createNativeQuery(
                """INSERT INTO operations (type, operation_date, note, items, total_quantity, differences)
                   VALUES (?, ?, ?, ?::jsonb, ?, ?::jsonb) RETURNING *""",
                Operation::class.java
            ).setParameter(1, "correction")
                .setParameter(2, operationDate?.let { java.time.LocalDate.parse(it) })
                .setParameter(3, correctionNote)
                .setParameter(4, objectMapper.writeValueAsString(emptyList<Map<String, Any?>>()))
                .setParameter(5, correctionTotal)
                .setParameter(6, objectMapper.writeValueAsString(correctionDiffs))

            @Suppress("UNCHECKED_CAST")
            val correctionOp = (correctionResult.resultList as List<Operation>).first()
            correctionOperationId = correctionOp.id
        }

        val refreshed = operationRepository.findById(oldOp.id!!).get()
        return operationToMap(refreshed) + ("correction_operation_id" to correctionOperationId)
    }

    @Transactional(rollbackFor = [Exception::class])
    fun deleteOperation(id: Long) {
        val operation = operationRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Operation not found")
        }

        // Rollback ozon_postings shipped flag
        if (operation.note?.startsWith("OZON FBS") == true) {
            ozonPostingRepository.clearShipmentFlagsByOperationId(id)
        }

        // Rollback quantities
        if (operation.items.isNotEmpty()) {
            for (item in operation.items) {
                val quantityChange = getRollbackQuantityChange(operation.type, item)
                if (quantityChange == 0) continue
                entityManager.createNativeQuery(
                    "UPDATE products SET quantity = GREATEST(0, quantity + ?), updated_at = NOW() WHERE id = ?"
                ).setParameter(1, quantityChange).setParameter(2, item["productId"]).executeUpdate()
            }
        }

        // Delete associated correction for shipment
        if (operation.type == "shipment") {
            entityManager.createNativeQuery(
                "DELETE FROM operations WHERE type = 'correction' AND note LIKE ?"
            ).setParameter(1, "Корректировка после отгрузки #${id}.%").executeUpdate()
        }

        operationRepository.delete(operation)
    }

    @Transactional(rollbackFor = [Exception::class])
    fun bulkDeleteOperations(ids: List<Long>): Map<String, Any> {
        val operations = ids.mapNotNull { id ->
            operationRepository.findById(id).orElse(null)
        }

        if (operations.isEmpty()) {
            throw ResourceNotFoundException("Operations not found")
        }

        // Rollback quantities
        for (operation in operations) {
            for (item in operation.items) {
                val quantityChange = getRollbackQuantityChange(operation.type, item)
                if (quantityChange == 0) continue
                entityManager.createNativeQuery(
                    "UPDATE products SET quantity = GREATEST(0, quantity + ?), updated_at = NOW() WHERE id = ?"
                ).setParameter(1, quantityChange).setParameter(2, item["productId"]).executeUpdate()
            }
        }

        val deletedIds = operations.map { it.id!! }
        val hasFbs = operations.any { it.note?.startsWith("OZON FBS") == true }
        val hasFbo = operations.any { it.note?.startsWith("OZON FBO") == true }

        // Unlink correction operations
        for (shipmentId in deletedIds) {
            entityManager.createNativeQuery(
                "DELETE FROM operations WHERE type = 'correction' AND note LIKE ?"
            ).setParameter(1, "Корректировка после отгрузки #${shipmentId}.%").executeUpdate()
        }

        // Unlink FBS posting flags
        if (hasFbs) {
            ozonPostingRepository.clearShipmentFlagsByOperationId(deletedIds.first().toLong())
            for (opId in deletedIds) {
                ozonPostingRepository.clearShipmentFlagsByOperationId(opId.toLong())
            }
        }

        // Unlink FBO supply flags
        if (hasFbo) {
            for (opId in deletedIds) {
                ozonFboSupplyRepository.clearShipmentFlagsByOperationId(opId.toLong())
            }
        }

        operationRepository.deleteAllById(deletedIds)

        return mapOf("success" to true, "deleted" to deletedIds.size)
    }

    // Helper functions matching operations.js logic
    private fun getItemQuantity(item: Map<String, Any?>): Int {
        val qty = (item["quantity"] as? Number)?.toInt() ?: 0
        return qty
    }

    private fun getShipmentAppliedQuantity(item: Map<String, Any?>): Int {
        val applied = (item["appliedQuantity"] as? Number)?.toInt()
        return applied ?: getItemQuantity(item)
    }

    private fun getRollbackQuantityChange(operationType: String, item: Map<String, Any?>): Int {
        return when (operationType) {
            "receipt" -> -getItemQuantity(item)
            "shipment" -> getShipmentAppliedQuantity(item)
            "writeoff" -> getItemQuantity(item)
            "correction" -> {
                val delta = (item["delta"] as? Number)?.toInt()
                if (delta != null) -delta else 0
            }
            else -> 0
        }
    }

    private fun getApplyQuantityChange(operationType: String, item: Map<String, Any?>): Int {
        return when (operationType) {
            "receipt" -> getItemQuantity(item)
            "shipment" -> -getShipmentAppliedQuantity(item)
            "writeoff" -> -getItemQuantity(item)
            "correction" -> {
                val delta = (item["delta"] as? Number)?.toInt()
                delta ?: 0
            }
            else -> 0
        }
    }

    private fun operationToMap(op: Operation): Map<String, Any?> {
        return mapOf(
            "id" to op.id,
            "type" to op.type,
            "operation_date" to op.operationDate?.toString(),
            "note" to op.note,
            "items" to op.items,
            "total_quantity" to op.totalQuantity,
            "differences" to op.differences,
            "created_at" to op.createdAt?.toString(),
            "updated_at" to op.updatedAt?.toString()
        )
    }
}
