package com.ozonware.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.ozonware.config.OzonProperties
import com.ozonware.entity.OzonFboSupply
import com.ozonware.entity.OzonFboSupplyItem
import com.ozonware.entity.OzonPosting
import com.ozonware.entity.OzonPostingItem
import com.ozonware.entity.Operation
import com.ozonware.entity.Product
import com.ozonware.exception.BadRequestException
import com.ozonware.repository.OzonFboSupplyItemRepository
import com.ozonware.repository.OzonFboSupplyRepository
import com.ozonware.repository.OzonPostingItemRepository
import com.ozonware.repository.OzonPostingRepository
import com.ozonware.repository.OperationRepository
import com.ozonware.repository.ProductRepository
import com.ozonware.util.ProductMatcher
import jakarta.persistence.EntityManager
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

@Service
class OzonService(
    private val productRepository: ProductRepository,
    private val operationRepository: OperationRepository,
    private val ozonPostingRepository: OzonPostingRepository,
    private val ozonPostingItemRepository: OzonPostingItemRepository,
    private val ozonFboSupplyRepository: OzonFboSupplyRepository,
    private val ozonFboSupplyItemRepository: OzonFboSupplyItemRepository,
    private val productMatcher: ProductMatcher,
    private val settingsService: SettingsService,
    private val ozonProperties: OzonProperties,
    private val entityManager: EntityManager,
    private val objectMapper: ObjectMapper
) {

    private val log = LoggerFactory.getLogger(OzonService::class.java)
    private val moscowZone = ZoneId.of("Europe/Moscow")

    private val httpClient = OkHttpClient.Builder().build()
    private val lastRequestAt = AtomicLong(0)

    // FBS sync state
    private val fbsSyncRunning = AtomicBoolean(false)
    private val fbsCancelRequested = AtomicBoolean(false)
    private var fbsEmitter: SseEmitter? = null

    // FBO sync state
    private val fboSyncRunning = AtomicBoolean(false)
    private val fboCancelRequested = AtomicBoolean(false)
    private var fboEmitter: SseEmitter? = null

    private val JSON = "application/json; charset=utf-8".toMediaType()

    // ── Settings ──

    private fun getOzonSettings(): JsonNode {
        val value = settingsService.getSetting("ozon_settings")
            ?: throw BadRequestException("OZON settings not configured")
        return objectMapper.valueToTree(value)
    }

    private fun saveOzonSettings(settings: Map<String, Any?>) {
        settingsService.saveSetting("ozon_settings", settings)
    }

    // ── Timezone helpers ──

    private fun utcToMoscow(utc: LocalDateTime): LocalDateTime {
        return utc.atZone(ZoneId.of("UTC")).withZoneSameInstant(moscowZone).toLocalDateTime()
    }

    private fun getMoscowYmdParts(date: ZonedDateTime): Triple<Int, Int, Int> {
        val moscow = date.withZoneSameInstant(moscowZone)
        return Triple(moscow.year, moscow.monthValue, moscow.dayOfMonth)
    }

    // ── Rate limiting ──

    private fun awaitRateLimit() {
        val now = System.currentTimeMillis()
        val elapsed = now - lastRequestAt.get()
        if (elapsed < ozonProperties.requestPauseMs) {
            Thread.sleep(ozonProperties.requestPauseMs - elapsed)
        }
    }

    private fun makeRequestByUrl(
        url: String,
        clientId: String,
        apiKey: String,
        body: Map<String, Any?>,
        signal: AtomicBoolean
    ): JsonNode {
        awaitRateLimit()

        if (signal.get()) throw CanceledException("Sync canceled by user")

        val jsonBody = objectMapper.writeValueAsString(body)
        val request = Request.Builder()
            .url(url)
            .post(jsonBody.toRequestBody(JSON))
            .addHeader("Content-Type", "application/json")
            .addHeader("Accept", "*/*")
            .addHeader("Client-Id", clientId)
            .addHeader("Api-Key", apiKey)
            .build()

        val response = httpClient.newCall(request).execute()
        lastRequestAt.set(System.currentTimeMillis())

        if (!response.isSuccessful) {
            throw RuntimeException("OZON API error: ${response.code} - ${response.body?.string()}")
        }

        return objectMapper.readTree(response.body?.string() ?: "{}")
    }

    // ── FBS Sync ──

    @Async
    fun startFbsSync(emitter: SseEmitter) {
        fbsEmitter = emitter
        try {
            fbsSyncRunning.set(true)
            fbsCancelRequested.set(false)

            val settings = getOzonSettings()
            val clientId = settings["clientId"]?.asText()
                ?: throw BadRequestException("OZON Client ID not configured")
            val apiKey = settings["apiKey"]?.asText()
                ?: throw BadRequestException("OZON API Key not configured")

            val syncStartDateStr = settings["syncStartDate"]?.asText()
            val syncBaseDate = syncStartDateStr?.let {
                try { LocalDate.parse(it).atStartOfDay() } catch (_: Exception) { LocalDateTime.now() }
            } ?: LocalDateTime.now()

            val syncDate = syncBaseDate.atZone(ZoneId.of("UTC"))
            val sinceParts = getMoscowYmdParts(syncDate)
            val sinceUTC = LocalDateTime.of(sinceParts.first, sinceParts.second, sinceParts.third, 21, 0)
                .atZone(ZoneId.of("UTC")).toInstant().toString()

            val now = ZonedDateTime.now(ZoneId.of("UTC"))
            val toParts = getMoscowYmdParts(now)
            val toUTCString = LocalDateTime.of(toParts.first, toParts.second, toParts.third, 20, 59, 59, 999_000_000)
                .atZone(ZoneId.of("UTC")).toInstant().toString()

            sendFbsProgress("loading", "Начало загрузки с ${sinceParts.first}-${String.format("%02d", sinceParts.second)}-${String.format("%02d", sinceParts.third)} до конца текущего дня (МСК)...")

            val allPostings = mutableListOf<JsonNode>()
            var offset = 0
            val limit = 1000
            var hasNext = true
            var pageNum = 0

            while (hasNext) {
                if (fbsCancelRequested.get()) throw CanceledException("FBS sync canceled by user")
                pageNum++

                val requestBody = mapOf(
                    "dir" to "DESC",
                    "filter" to mapOf("since" to sinceUTC, "to" to toUTCString),
                    "limit" to limit,
                    "offset" to offset,
                    "with" to mapOf(
                        "analytics_data" to true,
                        "barcodes" to false,
                        "financial_data" to false,
                        "translit" to false
                    )
                )

                sendFbsProgress("loading", "Загрузка страницы $pageNum (offset: $offset)...")

                val data = makeRequestByUrl(
                    ozonProperties.apiUrl, clientId, apiKey, requestBody, fbsCancelRequested
                )
                val postings = data["result"]?.get("postings") ?: objectMapper.createArrayNode()

                sendFbsProgress("loading", "Получено ${postings.size()} заказов (всего: ${allPostings.size + postings.size()})")

                for (i in 0 until postings.size()) {
                    allPostings.add(postings[i])
                }

                hasNext = data["result"]?.get("has_next")?.asBoolean() ?: false
                if (postings.size() == 0) hasNext = false
                offset += postings.size()
                if (postings.size() < limit) hasNext = false

                if (hasNext) {
                    Thread.sleep(300)
                }
            }

            sendFbsProgress("loading", "Загружено ${allPostings.size} заказов. Обработка...")

            val validPostings = filterAndDeduplicate(allPostings)

            sendFbsProgress("saving", "Сохранение ${validPostings.size} отправлений в БД...")

            var savedCount = 0
            for (posting in validPostings) {
                val postingId = upsertPosting(posting)
                savePostingItems(postingId, posting.get("products"))
                savedCount++

                if (savedCount % 10 == 0) {
                    sendFbsProgress("saving", "Сохранено $savedCount из ${validPostings.size}...")
                }
            }

            sendFbsProgress("complete", "Синхронизация завершена! ${validPostings.size} заказов")
            sendFbsComplete(mapOf("totalPostings" to validPostings.size, "message" to "ok"))

        } catch (e: CanceledException) {
            sendFbsProgress("canceled", "FBS синхронизация отменена пользователем")
        } catch (e: Exception) {
            log.error("OZON FBS sync error", e)
            sendFbsProgress("error", "Ошибка: ${e.message}")
        } finally {
            fbsSyncRunning.set(false)
            fbsCancelRequested.set(false)
        }
    }

    fun requestFbsCancel(): Boolean {
        if (!fbsSyncRunning.get()) return false
        fbsCancelRequested.set(true)
        fbsEmitter?.complete()
        return true
    }

    private fun filterAndDeduplicate(postings: List<JsonNode>): List<JsonNode> {
        val validStatuses = setOf("awaiting_deliver", "delivering", "delivered", "canceled", "cancelled")

        val filtered = postings.filter { p ->
            val status = p["status"]?.asText()?.lowercase() ?: ""
            if (status !in validStatuses) return@filter false

            if (status == "canceled" || status == "cancelled") {
                val cancelledAfterShip = p["cancellation"]?.get("cancelled_after_ship")?.asBoolean() ?: false
                val hasDeliveringDate = p["delivering_date"]?.asText()?.isNotEmpty() ?: false
                return@filter cancelledAfterShip || hasDeliveringDate
            }
            true
        }

        val unique = mutableMapOf<String, JsonNode>()
        filtered.forEach { p ->
            unique[p["posting_number"]?.asText() ?: ""] = p
        }

        return unique.values.toList()
    }

    private fun upsertPosting(posting: JsonNode): Long {
        val postingNumber = posting["posting_number"]?.asText() ?: ""
        val orderNumber = posting["order_number"]?.asText()
        val status = posting["status"]?.asText() ?: ""
        val inProcessAt = posting["in_process_at"]?.asText()

        val existing = ozonPostingRepository.findByPostingNumber(postingNumber)
        return if (existing.isPresent) {
            val p = existing.get()
            p.status = status
            p.rawData = objectMapper.convertValue(posting, Map::class.java) as Map<String, Any?>
            p.updatedAt = LocalDateTime.now()
            ozonPostingRepository.save(p).id!!
        } else {
            val p = OzonPosting(
                postingNumber = postingNumber,
                orderNumber = orderNumber,
                status = status,
                inProcessAt = inProcessAt?.let { parseTimestamp(it) },
                rawData = objectMapper.convertValue(posting, Map::class.java) as Map<String, Any?>
            )
            ozonPostingRepository.save(p).id!!
        }
    }

    private fun savePostingItems(postingId: Long, products: JsonNode?) {
        ozonPostingItemRepository.deleteByPostingId(postingId)

        if (products == null || !products.isArray) return

        val cache = productMatcher.buildLookupCache()

        for (i in 0 until products.size()) {
            val product = products[i]
            val sku = product["sku"]?.asText() ?: ""
            val offerId = product["offer_id"]?.asText()
            val quantity = product["quantity"]?.asInt() ?: 0
            val name = product["name"]?.asText()

            val dbProduct = productMatcher.findProductByOzonSku(sku, offerId, cache)

            val item = OzonPostingItem(
                postingId = postingId,
                ozonSku = sku,
                productId = dbProduct?.id,
                quantity = quantity,
                productName = name,
                offerId = offerId
            )
            ozonPostingItemRepository.save(item)
        }
    }

    // ── FBO Sync ──

    @Async
    fun startFboSync(emitter: SseEmitter) {
        fboEmitter = emitter
        try {
            fboSyncRunning.set(true)
            fboCancelRequested.set(false)

            val settings = getOzonSettings()
            val clientId = settings["clientId"]?.asText()
                ?: throw BadRequestException("OZON Client ID not configured")
            val apiKey = settings["apiKey"]?.asText()
                ?: throw BadRequestException("OZON API Key not configured")

            val orderIds = fetchFboOrderIds(clientId, apiKey)
            sendFboProgress("loading", "FBO list: найдено поставок ${orderIds.size}")

            if (orderIds.isEmpty()) {
                sendFboProgress("complete", "FBO: поставки не найдены")
                sendFboComplete(mapOf("supplies" to 0, "bundles" to 0, "items" to 0))
                return
            }

            val orders = fetchFboOrders(clientId, apiKey, orderIds)
            val supplies = extractFboSupplies(orders)

            sendFboProgress("saving", "FBO: найдено bundle ${supplies.size}, сохранение...")

            var saved = 0
            var totalItems = 0

            for (supply in supplies) {
                if (fboCancelRequested.get()) throw CanceledException("FBO sync canceled by user")

                val supplyDbId = upsertFboSupply(supply)
                saved++

                sendFboProgress("saving", "FBO: сохранено $saved/${supplies.size}")
            }

            sendFboProgress("complete", "FBO синхронизация завершена: поставок $saved")
            sendFboComplete(mapOf("supplies" to saved, "bundles" to supplies.size, "items" to totalItems))

        } catch (e: CanceledException) {
            sendFboProgress("canceled", "FBO синхронизация отменена пользователем")
        } catch (e: Exception) {
            log.error("OZON FBO sync error", e)
            sendFboProgress("error", "Ошибка FBO: ${e.message}")
        } finally {
            fboSyncRunning.set(false)
            fboCancelRequested.set(false)
        }
    }

    fun requestFboCancel(): Boolean {
        if (!fboSyncRunning.get()) return false
        fboCancelRequested.set(true)
        fboEmitter?.complete()
        return true
    }

    private fun fetchFboOrderIds(clientId: String, apiKey: String): List<Long> {
        var lastId = ""
        var page = 0
        val uniqueIds = mutableSetOf<Long>()

        while (true) {
            if (fboCancelRequested.get()) throw CanceledException("FBO sync canceled by user")
            page++

            val body = mutableMapOf<String, Any>(
                "filter" to mapOf("states" to listOf("COMPLETED", "ACCEPTED_AT_SUPPLY_WAREHOUSE")),
                "limit" to 100,
                "sort_by" to "ORDER_CREATION",
                "sort_dir" to "DESC"
            )
            if (lastId.isNotEmpty()) body["last_id"] = lastId

            val data = makeRequestByUrl(ozonProperties.fboListUrl, clientId, apiKey, body, fboCancelRequested)
            val payload = data["result"] ?: data
            val ids = payload["order_ids"] ?: objectMapper.createArrayNode()

            for (i in 0 until ids.size()) {
                uniqueIds.add(ids[i].asLong())
            }
            lastId = payload["last_id"]?.asText() ?: ""

            sendFboProgress("loading", "FBO list: страница $page, получено ${ids.size()}, всего ${uniqueIds.size}")

            if (lastId.isEmpty()) break
        }

        return uniqueIds.toList()
    }

    private fun fetchFboOrders(clientId: String, apiKey: String, orderIds: List<Long>): List<JsonNode> {
        val orders = mutableListOf<JsonNode>()
        val chunks = orderIds.chunked(50)

        for ((index, chunk) in chunks.withIndex()) {
            if (fboCancelRequested.get()) throw CanceledException("FBO sync canceled by user")

            val body = mapOf("order_ids" to chunk)
            val data = makeRequestByUrl(ozonProperties.fboGetUrl, clientId, apiKey, body, fboCancelRequested)
            val payload = data["result"] ?: data
            val part = payload["orders"] ?: objectMapper.createArrayNode()

            for (i in 0 until part.size()) {
                orders.add(part[i])
            }

            sendFboProgress("loading", "FBO get: ${index + 1}/${chunks.size}, поставок ${orders.size}")
        }

        return orders
    }

    private fun extractFboSupplies(orders: List<JsonNode>): List<Map<String, Any?>> {
        val supplies = mutableListOf<Map<String, Any?>>()
        for (order in orders) {
            val sups = order["supplies"] ?: continue
            if (!sups.isArray) continue

            for (i in 0 until sups.size()) {
                val supply = sups[i]
                val bundleId = supply["bundle_id"]?.asText() ?: continue

                val warehouse = supply["storage_warehouse"]

                supplies += mapOf(
                    "order_id" to order["order_id"]?.asLong(),
                    "order_number" to order["order_number"]?.asText(),
                    "state" to (order["state"]?.asText() ?: supply["state"]?.asText()),
                    "order_created_date" to order["created_date"]?.asText(),
                    "state_updated_date" to order["state_updated_date"]?.asText(),
                    "supply_id" to supply["supply_id"]?.asLong(),
                    "bundle_id" to bundleId,
                    "arrival_date" to warehouse?.get("arrival_date")?.asText(),
                    "warehouse_id" to warehouse?.get("warehouse_id")?.asLong(),
                    "warehouse_name" to warehouse?.get("name")?.asText(),
                    "warehouse_address" to warehouse?.get("address")?.asText(),
                    "raw_order" to order,
                    "raw_supply" to supply
                )
            }
        }
        return supplies
    }

    private fun upsertFboSupply(supply: Map<String, Any?>): Long {
        val bundleId = supply["bundle_id"] as String
        val existing = ozonFboSupplyRepository.findByBundleId(bundleId)

        return if (existing.isPresent) {
            val s = existing.get()
            s.orderId = supply["order_id"] as? Long ?: 0
            s.orderNumber = supply["order_number"] as? String
            s.state = supply["state"] as? String
            s.orderCreatedDate = (supply["order_created_date"] as? String)?.let { parseTimestamp(it) }
            s.stateUpdatedDate = (supply["state_updated_date"] as? String)?.let { parseTimestamp(it) }
            s.supplyId = supply["supply_id"] as? Long
            s.arrivalDate = (supply["arrival_date"] as? String)?.let { parseTimestamp(it) }
            s.warehouseId = supply["warehouse_id"] as? Long
            s.warehouseName = supply["warehouse_name"] as? String
            s.warehouseAddress = supply["warehouse_address"] as? String
            s.rawOrder = supply["raw_order"]?.let { @Suppress("UNCHECKED_CAST") it as Map<String, Any?> } ?: emptyMap()
            s.rawSupply = supply["raw_supply"]?.let { @Suppress("UNCHECKED_CAST") it as Map<String, Any?> } ?: emptyMap()
            s.updatedAt = LocalDateTime.now()
            ozonFboSupplyRepository.save(s).id!!
        } else {
            val s = OzonFboSupply(
                orderId = supply["order_id"] as? Long ?: 0,
                orderNumber = supply["order_number"] as? String,
                state = supply["state"] as? String,
                orderCreatedDate = (supply["order_created_date"] as? String)?.let { parseTimestamp(it) },
                stateUpdatedDate = (supply["state_updated_date"] as? String)?.let { parseTimestamp(it) },
                supplyId = supply["supply_id"] as? Long,
                bundleId = bundleId,
                arrivalDate = (supply["arrival_date"] as? String)?.let { parseTimestamp(it) },
                warehouseId = supply["warehouse_id"] as? Long,
                warehouseName = supply["warehouse_name"] as? String,
                warehouseAddress = supply["warehouse_address"] as? String,
                rawOrder = supply["raw_order"]?.let { @Suppress("UNCHECKED_CAST") it as Map<String, Any?> } ?: emptyMap(),
                rawSupply = supply["raw_supply"]?.let { @Suppress("UNCHECKED_CAST") it as Map<String, Any?> } ?: emptyMap()
            )
            ozonFboSupplyRepository.save(s).id!!
        }
    }

    // ── SSE helpers ──

    private fun sendFbsProgress(status: String, message: String) {
        try {
            fbsEmitter?.send(
                SseEmitter.event().data(mapOf("status" to status, "message" to message))
            )
        } catch (_: Exception) {
        }
    }

    private fun sendFbsComplete(result: Map<String, Any>) {
        try {
            fbsEmitter?.send(SseEmitter.event().data(mapOf("status" to "complete", "result" to result)))
            fbsEmitter?.complete()
        } catch (_: Exception) {
        }
    }

    private fun sendFboProgress(status: String, message: String) {
        try {
            fboEmitter?.send(
                SseEmitter.event().data(mapOf("status" to status, "message" to message))
            )
        } catch (_: Exception) {
        }
    }

    private fun sendFboComplete(result: Map<String, Any>) {
        try {
            fboEmitter?.send(SseEmitter.event().data(mapOf("status" to "complete", "result" to result)))
            fboEmitter?.complete()
        } catch (_: Exception) {
        }
    }

    // ── Sync product images ──

    @Transactional
    fun syncProductImagesFromOzon(): Map<String, Any> {
        val settings = getOzonSettings()
        val clientId = settings["clientId"]?.asText()
            ?: throw BadRequestException("OZON Client ID and API Key are required")
        val apiKey = settings["apiKey"]?.asText()
            ?: throw BadRequestException("OZON Client ID and API Key are required")

        ensureOzonPhotoField()

        val offerIds = mutableListOf<String>()
        var lastId = ""
        var page = 0

        do {
            page++
            val payload = mapOf(
                "filter" to mapOf(
                    "offer_id" to emptyList<String>(),
                    "product_id" to emptyList<Long>(),
                    "visibility" to "ALL"
                ),
                "last_id" to lastId,
                "limit" to 1000
            )

            val data = makeRequestByUrl(ozonProperties.productListUrl, clientId, apiKey, payload, AtomicBoolean(false))
            val items = data["result"]?.get("items") ?: objectMapper.createArrayNode()

            for (i in 0 until items.size()) {
                val offerId = items[i]["offer_id"]?.asText()?.trim()
                if (!offerId.isNullOrEmpty()) offerIds.add(offerId)
            }
            lastId = data["result"]?.get("last_id")?.asText()?.trim() ?: ""
            if (page > 1000) break
        } while (lastId.isNotEmpty())

        val uniqueOfferIds = offerIds.distinct()
        if (uniqueOfferIds.isEmpty()) {
            return mapOf("summary" to mapOf("offers" to 0, "details" to 0, "matched" to 0, "updated" to 0, "notFound" to 0, "noImage" to 0))
        }

        var detailsCount = 0
        var matched = 0
        var updated = 0
        var notFound = 0
        var noImage = 0

        val chunks = uniqueOfferIds.chunked(1000)
        for (chunk in chunks) {
            val payload = mapOf(
                "filter" to mapOf(
                    "offer_id" to chunk,
                    "visibility" to "ALL"
                ),
                "limit" to 1000,
                "sort_dir" to "ASC"
            )

            val data = makeRequestByUrl(ozonProperties.productAttributesUrl, clientId, apiKey, payload, AtomicBoolean(false))
            val details = data["result"] ?: objectMapper.createArrayNode()
            detailsCount += details.size()

            for (i in 0 until details.size()) {
                val detail = details[i]
                val offerId = detail["offer_id"]?.asText()?.trim() ?: continue
                if (offerId.isEmpty()) continue

                val product = productMatcher.findProductByOzonOfferId(offerId)
                if (product == null) {
                    notFound++
                    continue
                }
                matched++

                val imageUrl = detail["primary_image"]?.asText()?.trim() ?: ""
                if (imageUrl.isEmpty()) {
                    noImage++
                    continue
                }

                val nextCustomFields = buildCustomFieldsWithPhoto(product.customFields, imageUrl)
                val prevPhoto = product.customFields
                    .firstOrNull { (it["name"] as? String) == "Фото OZON" }?.get("value") as? String

                if (prevPhoto == imageUrl) continue

                entityManager.createNativeQuery(
                    "UPDATE products SET custom_fields = ?::jsonb, updated_at = NOW() WHERE id = ?"
                ).setParameter(1, objectMapper.writeValueAsString(nextCustomFields))
                    .setParameter(2, product.id)
                    .executeUpdate()
                updated++
            }
        }

        return mapOf(
            "summary" to mapOf(
                "offers" to uniqueOfferIds.size,
                "details" to detailsCount,
                "matched" to matched,
                "updated" to updated,
                "notFound" to notFound,
                "noImage" to noImage
            )
        )
    }

    private fun ensureOzonPhotoField() {
        val exists = entityManager.createNativeQuery(
            "SELECT id FROM product_fields WHERE name = 'Фото OZON' LIMIT 1"
        ).resultList.isNotEmpty()

        if (!exists) {
            entityManager.createNativeQuery(
                "INSERT INTO product_fields (name, type, required, show_in_table, options, position) VALUES (?, ?, ?, ?, ?::jsonb, ?)"
            ).setParameter(1, "Фото OZON")
                .setParameter(2, "text")
                .setParameter(3, false)
                .setParameter(4, false)
                .setParameter(5, "[]")
                .setParameter(6, 999)
                .executeUpdate()
        }
    }

    private fun buildCustomFieldsWithPhoto(
        customFields: List<Map<String, Any>>,
        photoUrl: String
    ): List<Map<String, Any>> {
        val normalized = customFields.toMutableList()
        val idx = normalized.indexOfFirst { (it["name"] as? String) == "Фото OZON" }
        val nextField = mapOf<String, Any>(
            "name" to "Фото OZON",
            "type" to "text",
            "value" to photoUrl,
            "required" to false
        )

        return if (idx >= 0) {
            normalized[idx] = nextField
            normalized
        } else {
            normalized + nextField
        }
    }

    // ── Shipment creation ──

    @Transactional
    fun createShipments(selectedDays: List<String>? = null): Map<String, Any?> {
        // Load daily stats
        val groupedByDay = loadDailyStats()

        val daysToProcess = if (selectedDays != null) {
            groupedByDay.filter { it["day"] in selectedDays }
        } else {
            groupedByDay
        }

        val results = mutableListOf<Map<String, Any?>>()

        for (day in daysToProcess) {
            val dayStr = day["day"] as String
            val dayItems = day["items"] as List<*>

            val existingOp = findExistingFbsOperation(dayStr)

            // Rollback existing
            if (existingOp != null && existingOp["items"] is List<*>) {
                @Suppress("UNCHECKED_CAST")
                for (oldItem in existingOp["items"] as List<Map<String, Any>>) {
                    val productId = (oldItem["productId"] as? Number)?.toLong() ?: continue
                    val qty = (oldItem["quantity"] as? Number)?.toInt() ?: 0
                    entityManager.createNativeQuery(
                        "UPDATE products SET quantity = quantity + ?, updated_at = NOW() WHERE id = ?"
                    ).setParameter(1, qty).setParameter(2, productId).executeUpdate()
                }
                clearPostingFlagsForOperation((existingOp["id"] as Number).toLong())
            }

            val cache = productMatcher.buildLookupCache()
            val items = mutableListOf<Map<String, Any?>>()
            var totalQuantity = 0
            val errors = mutableListOf<String>()

            for (rawItem in dayItems) {
                @Suppress("UNCHECKED_CAST")
                val item = rawItem as Map<String, Any>
                val sku = item["sku"] as? String ?: ""
                val offerId = item["offer_id"] as? String
                val requiredQty = (item["quantity"] as? Number)?.toInt() ?: 0

                val dbItem = productMatcher.findProductByOzonSku(sku, offerId, cache)
                if (dbItem == null) {
                    errors += "Товар не найден: OZN$sku"
                    continue
                }

                if (dbItem.quantity < requiredQty) {
                    errors += "Недостаточно товара ${dbItem.sku} (${dbItem.name}). На складе: ${dbItem.quantity}, требуется: $requiredQty, не хватает: ${requiredQty - dbItem.quantity}"
                    continue
                }

                items += mapOf<String, Any?>(
                    "quantity" to requiredQty,
                    "productId" to dbItem.id,
                    "productSKU" to dbItem.sku,
                    "productName" to dbItem.name
                )
                totalQuantity += requiredQty

                entityManager.createNativeQuery(
                    "UPDATE products SET quantity = quantity - ?, updated_at = NOW() WHERE id = ?"
                ).setParameter(1, requiredQty).setParameter(2, dbItem.id).executeUpdate()
            }

            if (errors.isNotEmpty()) {
                results += mapOf(
                    "day" to dayStr,
                    "status" to "error",
                    "errorCount" to errors.size,
                    "errors" to errors
                )
                continue
            }

            if (items.isEmpty()) {
                results += mapOf("day" to dayStr, "status" to "error", "error" to "Нет товаров для отгрузки")
                continue
            }

            val note = "OZON FBS от $dayStr"
            val opResult = if (existingOp != null) {
                entityManager.createNativeQuery(
                    """UPDATE operations SET note = ?, items = ?::jsonb, total_quantity = ?, differences = ?::jsonb, updated_at = NOW() WHERE id = ? RETURNING *""",
                    Operation::class.java
                ).setParameter(1, note)
                    .setParameter(2, objectMapper.writeValueAsString(items))
                    .setParameter(3, totalQuantity)
                    .setParameter(4, objectMapper.writeValueAsString(emptyList<Map<String, Any?>>()))
                    .setParameter(5, (existingOp["id"] as Number).toLong())
                    .resultList
            } else {
                entityManager.createNativeQuery(
                    """INSERT INTO operations (type, operation_date, note, items, total_quantity, differences) VALUES (?, ?, ?, ?::jsonb, ?, ?::jsonb) RETURNING *""",
                    Operation::class.java
                ).setParameter(1, "shipment")
                    .setParameter(2, dayStr)
                    .setParameter(3, note)
                    .setParameter(4, objectMapper.writeValueAsString(items))
                    .setParameter(5, totalQuantity)
                    .setParameter(6, objectMapper.writeValueAsString(emptyList<Map<String, Any?>>()))
                    .resultList
            }

            @Suppress("UNCHECKED_CAST")
            val operation = (opResult as List<Operation>).first()

            entityManager.createNativeQuery(
                """UPDATE ozon_postings SET shipped = true, shipment_applied = true, shipment_operation_id = ?, updated_at = NOW()
                   WHERE (in_process_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date = ?::date"""
            ).setParameter(1, operation.id).setParameter(2, dayStr).executeUpdate()

            results += mapOf(
                "day" to dayStr,
                "status" to if (existingOp != null) "replaced" else "success",
                "operationId" to operation.id,
                "itemsCount" to items.size,
                "totalQuantity" to totalQuantity
            )
        }

        val successCount = results.count { it["status"] in listOf("success", "replaced") }
        val errorCount = results.count { it["status"] == "error" }
        val alreadyProcessedCount = results.count { it["status"] == "already_processed" }

        return mapOf(
            "summary" to mapOf(
                "total" to results.size,
                "success" to successCount,
                "errors" to errorCount,
                "alreadyProcessed" to alreadyProcessedCount
            ),
            "details" to results
        )
    }

    private fun loadDailyStats(): List<Map<String, Any?>> {
        val ordersData = entityManager.createNativeQuery(
            """SELECT op.id, op.posting_number, op.status,
                  (op.in_process_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date AS day,
                  op.raw_data
               FROM ozon_postings op ORDER BY op.in_process_at DESC"""
        ).resultList

        @Suppress("UNCHECKED_CAST")
        val rows = ordersData as List<Array<Any?>>

        val groupedByDay = mutableListOf<MutableMap<String, Any?>>()
        val dayMap = mutableMapOf<String, MutableMap<String, Any?>>()

        for (row in rows) {
            val day = (row[3] as? java.time.LocalDate)?.toString() ?: continue

            val dayGroup = dayMap.getOrPut(day) {
                val group = mutableMapOf<String, Any?>(
                    "id" to ((row[0] as? Number)?.toLong() ?: 0L) as Any?,
                    "day" to day,
                    "orders" to mutableListOf<Map<String, Any?>>(),
                    "orderCount" to 0,
                    "items" to mutableListOf<MutableMap<String, Any?>>(),
                    "itemsCount" to 0,
                    "skuCount" to 0
                )
                groupedByDay += group
                group
            }

            @Suppress("UNCHECKED_CAST")
            val rawData = row[4] as? Map<String, Any?>
            val products = rawData?.get("products") as? List<*> ?: emptyList<Any>()

            val order = mutableMapOf<String, Any?>(
                "posting_number" to ((row[1] as? String) ?: "") as Any?,
                "status" to ((row[2] as? String) ?: "") as Any?,
                "items" to mutableListOf<Map<String, Any?>>(),
                "itemCount" to 0
            )

            for (rawProduct in products) {
                @Suppress("UNCHECKED_CAST")
                val product = rawProduct as Map<String, Any>
                val sku = "OZN${product["sku"]}"
                val qty = (product["quantity"] as? Number)?.toInt() ?: 0

                val orderItems = order["items"] as MutableList<Map<String, Any?>>
                orderItems += mapOf<String, Any?>(
                    "sku" to sku,
                    "quantity" to qty,
                    "name" to ((product["name"] as? String) ?: "") as Any?,
                    "offer_id" to ((product["offer_id"] as? String) ?: "") as Any?
                )
                order["itemCount"] = (order["itemCount"] as Int) + qty

                @Suppress("UNCHECKED_CAST")
                val dayItems = dayGroup["items"] as MutableList<MutableMap<String, Any?>>
                var dayItem = dayItems.find { it["sku"] == sku }
                if (dayItem == null) {
                    dayItem = mutableMapOf<String, Any?>(
                        "sku" to sku,
                        "name" to ((product["name"] as? String) ?: "") as Any?,
                        "offer_id" to ((product["offer_id"] as? String) ?: "") as Any?,
                        "quantity" to 0,
                        "orders" to mutableListOf<String>()
                    )
                    dayItems += dayItem
                }
                dayItem["quantity"] = (dayItem["quantity"] as Int) + qty
                @Suppress("UNCHECKED_CAST")
                val dayOrders = dayItem["orders"] as MutableList<String>
                if ((row[1] as? String) !in dayOrders) {
                    dayOrders += (row[1] as? String) ?: ""
                }
            }

            @Suppress("UNCHECKED_CAST")
            (dayGroup["orders"] as MutableList<Map<String, Any?>>) += order
            dayGroup["orderCount"] = (dayGroup["orderCount"] as Int) + 1
        }

        for (dayGroup in groupedByDay) {
            @Suppress("UNCHECKED_CAST")
            val items = dayGroup["items"] as List<Map<String, Any?>>
            dayGroup["itemsCount"] = items.sumOf { (it["quantity"] as? Int) ?: 0 }
            dayGroup["skuCount"] = items.size
        }

        return groupedByDay
    }

    private fun findExistingFbsOperation(day: String): Map<String, Any?>? {
        val result = entityManager.createNativeQuery(
            """SELECT * FROM operations WHERE type = 'shipment' AND operation_date = ?::date AND note LIKE 'OZON FBS от %' ORDER BY id DESC LIMIT 1"""
        ).setParameter(1, day).resultList

        @Suppress("UNCHECKED_CAST")
        val rows = result as List<Array<Any?>>
        if (rows.isEmpty()) return null

        val row = rows[0]
        return mapOf<String, Any?>(
            "id" to ((row[0] as? Number)?.toLong() ?: 0L) as Any?,
            "items" to emptyList<Map<String, Any?>>()
        )
    }

    private fun clearPostingFlagsForOperation(operationId: Long) {
        entityManager.createNativeQuery(
            "UPDATE ozon_postings SET shipment_applied = false, shipment_operation_id = NULL, updated_at = NOW() WHERE shipment_operation_id = ?"
        ).setParameter(1, operationId).executeUpdate()
    }

    private fun parseTimestamp(s: String): LocalDateTime? {
        return try {
            LocalDateTime.parse(s.substringBefore("Z").replace("T", " "))
        } catch (_: Exception) {
            try { Instant.parse(s).atZone(ZoneId.of("UTC")).toLocalDateTime() }
            catch (_: Exception) { null }
        }
    }

    class CanceledException(message: String) : RuntimeException(message)
}
