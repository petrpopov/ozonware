package com.ozonware.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.ozonware.entity.OzonOrderImportBatch
import com.ozonware.entity.OzonOrderLine
import com.ozonware.exception.BadRequestException
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.OperationInventoryDiffRepository
import com.ozonware.repository.OperationItemRepository
import com.ozonware.repository.OperationRepository
import com.ozonware.repository.OzonOrderImportBatchRepository
import com.ozonware.repository.OzonOrderLineRepository
import com.ozonware.repository.OzonPostingRepository
import com.ozonware.repository.ProductRepository
import com.ozonware.util.ProductMatcher
import jakarta.persistence.EntityManager
import org.springframework.data.domain.PageRequest
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.LocalDateTime
import java.time.ZoneOffset

/** Imports OZON order rows from Google Sheets — matches products, creates operations, stores import batches. */
@Service
class OzonOrderImportService(
    private val batchRepository: OzonOrderImportBatchRepository,
    private val orderLineRepository: OzonOrderLineRepository,
    private val ozonPostingRepository: OzonPostingRepository,
    private val productRepository: ProductRepository,
    private val productMatcher: ProductMatcher,
    private val operationRepository: OperationRepository,
    private val operationItemRepository: OperationItemRepository,
    private val operationInventoryDiffRepository: OperationInventoryDiffRepository,
    private val entityManager: EntityManager,
    private val objectMapper: ObjectMapper
) {

    @Transactional
    fun importRows(body: Map<String, Any?>): Map<String, Any?> {
        val source = (body["source"] as? String)?.trim()
        if (source !in listOf("fbs_csv", "fbo_csv")) {
            throw BadRequestException("Invalid source. Use fbs_csv or fbo_csv")
        }

        @Suppress("UNCHECKED_CAST")
        val rows = body["rows"] as? List<Map<String, Any?>>
        if (rows.isNullOrEmpty()) {
            throw BadRequestException("rows array is required")
        }

        val fileName = body["file_name"] as? String

        val batch = OzonOrderImportBatch(
            source = source!!,
            fileName = fileName,
            importedAt = LocalDateTime.now(ZoneOffset.UTC),
            rowsTotal = rows.size
        )
        batchRepository.save(batch)

        // Build posting_number → id cache to populate FK on import
        val postingNumbersInBatch = rows.mapNotNull {
            getCell(it, "Номер отправления").trim().ifEmpty { null }
        }.distinct()
        val postingIdCache = mutableMapOf<String, Long>()
        for (num in postingNumbersInBatch) {
            ozonPostingRepository.findByPostingNumber(num).ifPresent { postingIdCache[num] = it.id!! }
        }

        val cache = productMatcher.buildLookupCache()
        var saved = 0
        var updated = 0
        var skipped = 0
        var unmatched = 0

        for (rawRow in rows) {
            val status = getCell(rawRow, "Статус").trim().lowercase()
            val transferAt = parseDateTime(getCell(rawRow, "Фактическая дата передачи в доставку"))

            // Skip canceled orders without transfer date
            if ((status == "отменён" || status == "отменен") && transferAt == null) {
                skipped++
                continue
            }

            val quantity = parseInteger(getCell(rawRow, "Количество"))
            val postingNumber = getCell(rawRow, "Номер отправления").trim()
            val offerId = getCell(rawRow, "Артикул").trim()
            val ozonSku = getCell(rawRow, "SKU").trim()

            if (postingNumber.isEmpty() || quantity == null || quantity <= 0) {
                skipped++
                continue
            }

            var matchedProduct: com.ozonware.entity.Product? = null
            var matchedBy: String? = null

            if (offerId.isNotEmpty()) {
                matchedProduct = cache.byOffer[offerId.lowercase()]
                if (matchedProduct != null) matchedBy = "offer_id"
            }
            if (matchedProduct == null && ozonSku.isNotEmpty()) {
                val normalizedSku = normalizeOzonSku(ozonSku)
                matchedProduct = cache.byOzonSku[normalizedSku]
                if (matchedProduct != null) matchedBy = "ozon_sku"
            }
            if (matchedProduct == null && ozonSku.isNotEmpty()) {
                matchedProduct = cache.bySku[ozonSku.lowercase()]
                if (matchedProduct != null) matchedBy = "sku"
            }

            if (matchedProduct == null) {
                unmatched++
            }

            val externalKey = listOf(
                source, postingNumber, offerId.lowercase(),
                normalizeOzonSku(ozonSku),
                getCell(rawRow, "Принят в обработку"),
                getCell(rawRow, "Номер заказа")
            ).joinToString("|")

            val existingLine = orderLineRepository.findByExternalLineKey(externalKey)

            if (existingLine != null) {
                existingLine.batchId = batch.id
                existingLine.source = source!!
                existingLine.orderNumber = getCell(rawRow, "Номер заказа")
                existingLine.postingNumber = postingNumber
                existingLine.acceptedAt = parseDateTime(getCell(rawRow, "Принят в обработку"))
                existingLine.shipmentDate = parseDateTime(getCell(rawRow, "Дата отгрузки"))
                existingLine.shipmentDeadline = parseDateTime(getCell(rawRow, "Дата отгрузки без просрочки"))
                existingLine.transferAt = transferAt
                existingLine.deliveryDate = parseDateTime(getCell(rawRow, "Дата доставки"))
                existingLine.cancellationDate = parseDateTime(getCell(rawRow, "Дата отмены"))
                existingLine.status = getCell(rawRow, "Статус").trim()
                existingLine.productName = getCell(rawRow, "Название товара")
                existingLine.ozonSku = ozonSku
                existingLine.offerId = offerId
                existingLine.quantity = quantity
                existingLine.yourPrice = parseDecimal(getCell(rawRow, "Ваша цена"))
                existingLine.paidByCustomer = parseDecimal(getCell(rawRow, "Оплачено покупателем"))
                existingLine.shipmentAmount = parseDecimal(getCell(rawRow, "Сумма отправления"))
                existingLine.currency = getCell(rawRow, "Код валюты отправления", "Код валюты товара")
                existingLine.discountPercent = getCell(rawRow, "Скидка %")
                existingLine.discountRub = parseDecimal(getCell(rawRow, "Скидка руб"))
                existingLine.shippingCost = parseDecimal(getCell(rawRow, "Стоимость доставки"))
                existingLine.promotions = getCell(rawRow, "Акции")
                existingLine.volumetricWeightKg = parseDecimal(getCell(rawRow, "Объемный вес товаров, кг"))
                existingLine.productId = matchedProduct?.id
                existingLine.matchedBy = matchedBy
                existingLine.postingId = postingIdCache[postingNumber]
                existingLine.raw = rawRow
                existingLine.updatedAt = LocalDateTime.now(ZoneOffset.UTC)
                orderLineRepository.save(existingLine)
                updated++
            } else {
                val line = OzonOrderLine(
                    externalLineKey = externalKey,
                    batchId = batch.id,
                    source = source!!,
                    orderNumber = getCell(rawRow, "Номер заказа"),
                    postingNumber = postingNumber,
                    acceptedAt = parseDateTime(getCell(rawRow, "Принят в обработку")),
                    shipmentDate = parseDateTime(getCell(rawRow, "Дата отгрузки")),
                    shipmentDeadline = parseDateTime(getCell(rawRow, "Дата отгрузки без просрочки")),
                    transferAt = transferAt,
                    deliveryDate = parseDateTime(getCell(rawRow, "Дата доставки")),
                    cancellationDate = parseDateTime(getCell(rawRow, "Дата отмены")),
                    status = getCell(rawRow, "Статус").trim(),
                    productName = getCell(rawRow, "Название товара"),
                    ozonSku = ozonSku,
                    offerId = offerId,
                    quantity = quantity,
                    yourPrice = parseDecimal(getCell(rawRow, "Ваша цена")),
                    paidByCustomer = parseDecimal(getCell(rawRow, "Оплачено покупателем")),
                    shipmentAmount = parseDecimal(getCell(rawRow, "Сумма отправления")),
                    currency = getCell(rawRow, "Код валюты отправления", "Код валюты товара"),
                    discountPercent = getCell(rawRow, "Скидка %"),
                    discountRub = parseDecimal(getCell(rawRow, "Скидка руб")),
                    shippingCost = parseDecimal(getCell(rawRow, "Стоимость доставки")),
                    promotions = getCell(rawRow, "Акции"),
                    volumetricWeightKg = parseDecimal(getCell(rawRow, "Объемный вес товаров, кг")),
                    productId = matchedProduct?.id,
                    matchedBy = matchedBy,
                    postingId = postingIdCache[postingNumber],
                    raw = rawRow.filterValues { it != null } as Map<String, Any>
                )
                orderLineRepository.save(line)
                saved++
            }
        }

        batch.rowsSaved = saved
        batch.rowsUpdated = updated
        batch.rowsSkipped = skipped
        batch.rowsUnmatched = unmatched
        batch.summary = mapOf(
            "total" to rows.size,
            "saved" to saved,
            "updated" to updated,
            "skipped" to skipped,
            "unmatched" to unmatched
        )
        batchRepository.save(batch)

        return mapOf("batch_id" to batch.id, "summary" to batch.summary)
    }

    fun getImports(limit: Int): List<Map<String, Any?>> {
        val actualLimit = maxOf(1, minOf(200, limit))
        val batches = batchRepository.findAllByOrderByImportedAtDescIdDesc(PageRequest.of(0, actualLimit))
        return batches.map { b ->
            mapOf(
                "id" to b.id,
                "source" to b.source,
                "file_name" to b.fileName,
                "imported_at" to b.importedAt.toString(),
                "rows_total" to b.rowsTotal,
                "rows_saved" to b.rowsSaved,
                "rows_updated" to b.rowsUpdated,
                "rows_skipped" to b.rowsSkipped,
                "rows_unmatched" to b.rowsUnmatched,
                "summary" to b.summary
            )
        }
    }

    fun getProductStats(productId: Long): Map<String, Any?> {
        val product = productRepository.findById(productId)
            .orElseThrow { ResourceNotFoundException("Product not found") }

        val orderLines = orderLineRepository.findAllByProductId(productId)
        val orderStats = buildOrderStats(orderLines)

        // Warehouse stats from normalized operation_items / operation_inventory_diffs
        val opItems = operationItemRepository.findAllByProductId(productId)
        val invDiffs = operationInventoryDiffRepository.findAllByProductId(productId)

        // Batch-load operations to get type/date
        val opIds = (opItems.map { it.operationId } + invDiffs.map { it.operationId }).distinct()
        val opsById = if (opIds.isEmpty()) emptyMap() else
            operationRepository.findAllById(opIds).associateBy { it.id!! }

        var receiptsQty = 0
        var shipmentsQty = 0
        var writeoffsQty = 0
        var correctionsQty = 0L
        var lastMovementAt: String? = null

        for (item in opItems) {
            val op = opsById[item.operationId] ?: continue
            val dt = (op.operationDate?.toString()) ?: op.createdAt?.toString()
            if (dt != null && (lastMovementAt == null || dt > lastMovementAt)) lastMovementAt = dt
            val delta = item.delta?.toLong() ?: 0L
            when (op.typeCode) {
                "receipt"    -> receiptsQty += delta.toInt()
                "shipment"   -> shipmentsQty += (-delta).toInt()
                "writeoff"   -> writeoffsQty += (-delta).toInt()
                "correction" -> correctionsQty += delta
            }
        }

        var inventoryDiffQty = 0L
        for (diff in invDiffs) {
            val op = opsById[diff.operationId] ?: continue
            val dt = (op.operationDate?.toString()) ?: op.createdAt?.toString()
            if (dt != null && (lastMovementAt == null || dt > lastMovementAt)) lastMovementAt = dt
            inventoryDiffQty += (diff.actual - diff.expected).toLong()
        }

        val warehouseStats = mapOf(
            "receipts_qty" to receiptsQty,
            "shipments_qty" to shipmentsQty,
            "writeoffs_qty" to writeoffsQty,
            "corrections_qty" to correctionsQty,
            "inventory_diff_qty" to inventoryDiffQty,
            "last_movement_at" to lastMovementAt
        )

        return mapOf(
            "product" to mapOf(
                "id" to product.id,
                "name" to product.name,
                "sku" to product.sku,
                "quantity" to product.quantity
            ),
            "warehouse" to warehouseStats,
            "orders" to orderStats
        )
    }

    fun getProductTimeline(productId: Long, limit: String? = null, offset: String? = null, all: Boolean = false): Map<String, Any?> {
        val orderLines = orderLineRepository.findAllByProductId(productId)

        // Warehouse movements from operation_items
        val opItems = operationItemRepository.findAllByProductId(productId)
        val invDiffs = operationInventoryDiffRepository.findAllByProductId(productId)
        val opIds = (opItems.map { it.operationId } + invDiffs.map { it.operationId }).distinct()
        val opsById = if (opIds.isEmpty()) emptyMap() else
            operationRepository.findAllById(opIds).associateBy { it.id!! }

        val movements = mutableListOf<Map<String, Any?>>()

        for (row in orderLines) {
            movements += mapOf<String, Any?>(
                "kind" to "ozon_order",
                "event_type" to "order",
                "event_time" to (row.acceptedAt ?: row.shipmentDate ?: row.transferAt ?: row.deliveryDate)?.toString(),
                "source" to row.source,
                "order_line_id" to row.id,
                "order_number" to row.orderNumber,
                "posting_number" to row.postingNumber,
                "status" to row.status,
                "quantity" to row.quantity,
                "your_price" to row.yourPrice,
                "paid_by_customer" to row.paidByCustomer,
                "offer_id" to row.offerId,
                "ozon_sku" to row.ozonSku
            )
        }

        for (item in opItems) {
            val op = opsById[item.operationId] ?: continue
            val delta = item.delta?.toLong() ?: 0L
            if (delta == 0L) continue
            val eventTime = (op.operationDate?.toString()) ?: op.createdAt?.toString()
            movements += mapOf<String, Any?>(
                "kind" to "warehouse",
                "event_type" to op.typeCode,
                "event_time" to eventTime,
                "operation_id" to op.id,
                "channel_code" to op.channelCode,
                "note" to op.note,
                "qty_change" to delta,
                "product_name_snapshot" to item.productNameSnapshot,
                "product_sku_snapshot" to item.productSkuSnapshot
            )
        }

        for (diff in invDiffs) {
            val op = opsById[diff.operationId] ?: continue
            val diffVal = diff.actual - diff.expected
            if (diffVal.toLong() == 0L) continue
            val eventTime = (op.operationDate?.toString()) ?: op.createdAt?.toString()
            movements += mapOf<String, Any?>(
                "kind" to "warehouse",
                "event_type" to "inventory",
                "event_time" to eventTime,
                "operation_id" to op.id,
                "channel_code" to op.channelCode,
                "note" to op.note,
                "qty_change" to diffVal.toLong(),
                "expected" to diff.expected,
                "actual" to diff.actual,
                "product_name_snapshot" to diff.productNameSnapshot,
                "product_sku_snapshot" to diff.productSkuSnapshot
            )
        }

        movements.sortByDescending { m -> m["event_time"]?.toString() ?: "" }
        val total = movements.size
        val actualLimit = if (all) Int.MAX_VALUE else maxOf(1, minOf(500, limit?.toIntOrNull() ?: 200))
        val actualOffset = maxOf(0, offset?.toIntOrNull() ?: 0)

        return mapOf(
            "items" to movements.subList(actualOffset, minOf(actualOffset + actualLimit, total)),
            "total" to total,
            "limit" to if (all) null else actualLimit,
            "offset" to actualOffset
        )
    }

    private fun buildOrderStats(orderLines: List<OzonOrderLine>): Map<String, Any> {
        var unitsTotal = 0
        var unitsCanceled = 0
        var unitsDelivered = 0
        var unitsTransferred = 0
        var revenueGross = BigDecimal.ZERO
        var revenuePaid = BigDecimal.ZERO
        val postings = mutableSetOf<String>()
        val fbsUnits = mutableMapOf<String, Int>()
        val fbsPostings = mutableMapOf<String, MutableSet<String>>()
        val fboUnits = mutableMapOf<String, Int>()
        val fboPostings = mutableMapOf<String, MutableSet<String>>()

        for (row in orderLines) {
            val qty = row.quantity
            val status = row.status?.lowercase() ?: ""
            unitsTotal += qty
            if (row.postingNumber != null) postings.add(row.postingNumber)
            if (status.contains("отмен")) unitsCanceled += qty
            if (status.contains("достав")) unitsDelivered += qty
            if (row.transferAt != null) unitsTransferred += qty

            val yourPrice = row.yourPrice ?: BigDecimal.ZERO
            val paid = row.paidByCustomer ?: BigDecimal.ZERO
            revenueGross = revenueGross.add(yourPrice.multiply(BigDecimal(qty)))
            revenuePaid = revenuePaid.add(paid.multiply(BigDecimal(qty)))

            val src = if (row.source == "fbo_csv") "fbo_csv" else "fbs_csv"
            if (src == "fbs_csv") {
                fbsUnits["units"] = (fbsUnits["units"] ?: 0) + qty
                if (row.postingNumber != null) {
                    fbsPostings.getOrPut("postings") { mutableSetOf() }.add(row.postingNumber)
                }
            } else {
                fboUnits["units"] = (fboUnits["units"] ?: 0) + qty
                if (row.postingNumber != null) {
                    fboPostings.getOrPut("postings") { mutableSetOf() }.add(row.postingNumber)
                }
            }
        }

        return mapOf(
            "lines" to orderLines.size,
            "postings" to postings.size,
            "units_total" to unitsTotal,
            "units_canceled" to unitsCanceled,
            "units_delivered" to unitsDelivered,
            "units_transferred" to unitsTransferred,
            "revenue_gross" to revenueGross.toDouble().toBigDecimal().setScale(2, java.math.RoundingMode.HALF_UP).toDouble(),
            "revenue_paid" to revenuePaid.toDouble().toBigDecimal().setScale(2, java.math.RoundingMode.HALF_UP).toDouble(),
            "by_source" to mapOf(
                "fbs_csv" to mapOf<String, Any>(
                    "units" to (fbsUnits["units"] ?: 0),
                    "postings" to (fbsPostings["postings"]?.size ?: 0)
                ),
                "fbo_csv" to mapOf<String, Any>(
                    "units" to (fboUnits["units"] ?: 0),
                    "postings" to (fboPostings["postings"]?.size ?: 0)
                )
            )
        )
    }

    private fun getCell(row: Map<String, Any?>, vararg keys: String): String {
        for (key in keys) {
            if (row.containsKey(key)) {
                val v = row[key]
                return v?.toString()?.trim() ?: ""
            }
        }
        return ""
    }

    private fun parseDecimal(value: String): BigDecimal? {
        val raw = value.replace(Regex("\\s+"), "").replace(',', '.')
        if (raw.isEmpty()) return null
        val n = raw.toDoubleOrNull()
        return if (n != null) BigDecimal(n) else null
    }

    private fun parseInteger(value: String): Int? {
        val n = parseDecimal(value)
        return n?.toInt()
    }

    private fun parseDateTime(value: String): LocalDateTime? {
        if (value.isEmpty()) return null
        val m = Regex("""^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?""").find(value)
            ?: return null
        val hh = m.groupValues[4].ifEmpty { "00" }
        val mm = m.groupValues[5].ifEmpty { "00" }
        val ss = m.groupValues[6].ifEmpty { "00" }
        return try {
            LocalDateTime.of(
                m.groupValues[1].toInt(),
                m.groupValues[2].toInt(),
                m.groupValues[3].toInt(),
                hh.toInt(), mm.toInt(), ss.toInt()
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun normalizeOzonSku(value: String): String {
        val raw = value.replace(Regex("^ozn", RegexOption.IGNORE_CASE), "")
        return raw.replace(Regex("\\s+"), "")
    }
}
