package com.ozonware.service

import com.ozonware.OzonMockApiBase
import com.ozonware.repository.OzonPostingItemRepository
import com.ozonware.repository.OzonPostingRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

/**
 * Integration tests for [OzonService.startFbsSync].
 *
 * Each test enqueues mock OZON API responses and verifies the resulting
 * state in [OzonPostingRepository] / [OzonPostingItemRepository].
 *
 * Scenarios covered:
 *  1. Basic sync — posting + items land in DB
 *  2. Idempotency — re-sync with identical data produces no duplicates
 *  3. Status update — re-sync with changed status updates the existing row
 *  4. Multi-article posting — all products within one posting are saved as separate items
 *  5. Cancelled-not-shipped — excluded from DB (cancelled_after_ship = false)
 *  6. Cancelled-after-ship — included in DB (cancelled_after_ship = true)
 */
class OzonFbsSyncTest : OzonMockApiBase() {

    @Autowired private lateinit var ozonService: OzonService
    @Autowired private lateinit var settingsService: SettingsService
    @Autowired private lateinit var productFieldsService: ProductFieldsService
    @Autowired private lateinit var ozonPostingRepository: OzonPostingRepository
    @Autowired private lateinit var ozonPostingItemRepository: OzonPostingItemRepository

    @BeforeEach
    fun setup() {
        // Clean FBS tables (items first — FK dependency)
        ozonPostingItemRepository.deleteAll()
        ozonPostingRepository.deleteAll()

        // Ensure OZON field definitions exist (idempotent)
        productFieldsService.ensureSystemField("OZON",         "ozon_sku",     "text")
        productFieldsService.ensureSystemField("Артикул OZON", "ozon_article", "text")
        productFieldsService.ensureSystemField("Фото OZON",    "ozon_photo",   "image")

        // Save OZON credentials — required by getOzonSettings()
        settingsService.saveSetting(
            "ozon_settings",
            mapOf("clientId" to "test-client", "apiKey" to "test-api-key", "syncStartDate" to "2026-01-01")
        )
    }

    // ── Test 1: basic sync ─────────────────────────────────────────────────────

    @Test
    fun `startFbsSync - single posting with one product - saves posting and item to DB`() {
        enqueue(fbsPage(
            fbsPosting("FBS-001-1", "delivered", listOf(product("111", "art-blue", qty = 2)))
        ))

        runSync { ozonService.startFbsSync(it) }

        val postings = ozonPostingRepository.findAll()
        assertThat(postings).hasSize(1)
        assertThat(postings[0].postingNumber).isEqualTo("FBS-001-1")
        assertThat(postings[0].status).isEqualTo("delivered")
        assertThat(postings[0].orderNumber).isEqualTo("FBS-001")

        val items = ozonPostingItemRepository.findAll()
        assertThat(items).hasSize(1)
        assertThat(items[0].ozonSku).isEqualTo("111")
        assertThat(items[0].offerId).isEqualTo("art-blue")
        assertThat(items[0].quantity).isEqualTo(2)
        assertThat(items[0].postingId).isEqualTo(postings[0].id)
    }

    // ── Test 2: idempotency — no duplicates on re-sync ─────────────────────────

    @Test
    fun `startFbsSync - called twice with same data - produces no duplicates`() {
        val response = fbsPage(
            fbsPosting("FBS-002-1", "delivering", listOf(product("222", "art-red", qty = 1)))
        )

        enqueue(response)
        runSync { ozonService.startFbsSync(it) }

        enqueue(response)
        runSync { ozonService.startFbsSync(it) }

        assertThat(ozonPostingRepository.count()).isEqualTo(1)
        assertThat(ozonPostingItemRepository.count()).isEqualTo(1)
    }

    // ── Test 3: re-sync updates existing posting status ────────────────────────

    @Test
    fun `startFbsSync - re-sync with updated status - updates existing posting`() {
        enqueue(fbsPage(
            fbsPosting("FBS-003-1", "delivering", listOf(product("333", "art-green", qty = 1)))
        ))
        runSync { ozonService.startFbsSync(it) }

        assertThat(ozonPostingRepository.findAll()[0].status).isEqualTo("delivering")

        // Second sync: same posting number, status changed to "delivered"
        enqueue(fbsPage(
            fbsPosting("FBS-003-1", "delivered", listOf(product("333", "art-green", qty = 1)))
        ))
        runSync { ozonService.startFbsSync(it) }

        assertThat(ozonPostingRepository.count()).isEqualTo(1)
        assertThat(ozonPostingRepository.findAll()[0].status).isEqualTo("delivered")
        // Items must be refreshed, still exactly 1
        assertThat(ozonPostingItemRepository.count()).isEqualTo(1)
    }

    // ── Test 4: multi-article posting — all items saved ─────────────────────────
    //
    // This is the key regression for the CSV dedup bug:
    // When one posting contains several products, each product must be stored as a
    // separate OzonPostingItem row — none should be lost due to deduplication.

    @Test
    fun `startFbsSync - posting with two products - saves both items`() {
        enqueue(fbsPage(
            fbsPosting(
                "FBS-004-1", "delivered",
                listOf(product("111", "art-blue", qty = 2), product("222", "art-red", qty = 1))
            )
        ))

        runSync { ozonService.startFbsSync(it) }

        assertThat(ozonPostingRepository.count()).isEqualTo(1)

        val items = ozonPostingItemRepository.findAll()
        assertThat(items).hasSize(2)
        assertThat(items.map { it.ozonSku }).containsExactlyInAnyOrder("111", "222")
        assertThat(items.sumOf { it.quantity }).isEqualTo(3)
    }

    // ── Test 5: cancelled-not-shipped — excluded ───────────────────────────────

    @Test
    fun `startFbsSync - cancelled posting without shipment - is not saved to DB`() {
        enqueue(fbsPage(
            fbsPosting(
                "FBS-005-1", "cancelled",
                listOf(product("111", "art-blue", qty = 1)),
                cancelledAfterShip = false   // cancelled BEFORE handing over to delivery
            )
        ))

        runSync { ozonService.startFbsSync(it) }

        assertThat(ozonPostingRepository.count()).isEqualTo(0)
        assertThat(ozonPostingItemRepository.count()).isEqualTo(0)
    }

    // ── Test 6: cancelled-after-ship — included ────────────────────────────────

    @Test
    fun `startFbsSync - cancelled posting that was already shipped - is saved to DB`() {
        enqueue(fbsPage(
            fbsPosting(
                "FBS-006-1", "cancelled",
                listOf(product("111", "art-blue", qty = 1)),
                cancelledAfterShip = true    // seller already shipped; buyer cancelled after
            )
        ))

        runSync { ozonService.startFbsSync(it) }

        assertThat(ozonPostingRepository.count()).isEqualTo(1)
        assertThat(ozonPostingRepository.findAll()[0].status).isEqualTo("cancelled")
        assertThat(ozonPostingItemRepository.count()).isEqualTo(1)
    }

    // ── JSON helpers ───────────────────────────────────────────────────────────

    /** FBS list response envelope — matches OZON /v3/posting/fbs/list response. */
    private fun fbsPage(
        vararg postings: Map<String, Any?>,
        hasNext: Boolean = false
    ): String = objectMapper.writeValueAsString(
        mapOf("result" to mapOf("postings" to postings.toList(), "has_next" to hasNext))
    )

    /**
     * One FBS posting object matching the real API structure.
     * [cancelledAfterShip] maps to `cancellation.cancelled_after_ship`.
     */
    private fun fbsPosting(
        postingNumber: String,
        status: String,
        products: List<Map<String, Any?>>,
        cancelledAfterShip: Boolean = false,
        inProcessAt: String = "2026-01-30T07:00:00.000Z"
    ): Map<String, Any?> = mapOf(
        "posting_number" to postingNumber,
        "order_number"   to postingNumber.substringBeforeLast("-"),
        "status"         to status,
        "in_process_at"  to inProcessAt,
        "products"       to products,
        "cancellation"   to mapOf("cancelled_after_ship" to cancelledAfterShip)
    )

    /** One product entry inside a posting's `products` array. */
    private fun product(sku: String, offerId: String, qty: Int = 1): Map<String, Any?> = mapOf(
        "sku"      to sku,
        "offer_id" to offerId,
        "name"     to "Product $offerId",
        "quantity" to qty
    )
}
