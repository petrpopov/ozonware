package com.ozonware.service

import com.ozonware.OzonMockApiBase
import com.ozonware.repository.OzonFboSupplyItemRepository
import com.ozonware.repository.OzonFboSupplyRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

/**
 * Integration tests for [OzonService.startFboSync].
 *
 * Mocks three OZON endpoints in the order they are called:
 *   POST /v3/supply-order/list   — paginated order ID list
 *   POST /v3/supply-order/get    — order details (batch, up to 50 IDs)
 *   POST /v1/supply-order/bundle — bundle item list (per bundle)
 *
 * Scenarios covered:
 *  1. Basic sync — supply + items saved to DB
 *  2. Idempotency — re-sync produces no duplicates (bundle_id is the natural key)
 *  3. Items refresh — re-sync restores items deleted from DB in between syncs
 *  4. Paginated order list — multiple pages of order_ids are all loaded
 */
class OzonFboSyncTest : OzonMockApiBase() {

    @Autowired private lateinit var ozonService: OzonService
    @Autowired private lateinit var settingsService: SettingsService
    @Autowired private lateinit var productFieldsService: ProductFieldsService
    @Autowired private lateinit var ozonFboSupplyRepository: OzonFboSupplyRepository
    @Autowired private lateinit var ozonFboSupplyItemRepository: OzonFboSupplyItemRepository

    @BeforeEach
    fun setup() {
        // Clean FBO tables (items first — FK dependency)
        ozonFboSupplyItemRepository.deleteAll()
        ozonFboSupplyRepository.deleteAll()

        productFieldsService.ensureSystemField("OZON",         "ozon_sku",     "text")
        productFieldsService.ensureSystemField("Артикул OZON", "ozon_article", "text")
        productFieldsService.ensureSystemField("Фото",    "ozon_photo",   "image")

        settingsService.saveSetting(
            "ozon_settings",
            mapOf("clientId" to "test-client", "apiKey" to "test-api-key")
        )
    }

    // ── Test 1: basic sync ─────────────────────────────────────────────────────

    @Test
    fun `startFboSync - single order with one bundle - saves supply and items to DB`() {
        // 1. supply-order/list: one order, no more pages
        enqueue(fboListPage(orderIds = listOf(12345L)))
        // 2. supply-order/get: details for order 12345
        enqueue(fboGetResponse(fboOrder(12345L, "FBO-12345", "BUNDLE-001")))
        // 3. supply-order/bundle: items in BUNDLE-001
        enqueue(fboBundlePage(bundleItem("333", "art-green", qty = 5)))

        runSync { ozonService.startFboSync(it) }

        val supplies = ozonFboSupplyRepository.findAll()
        assertThat(supplies).hasSize(1)
        assertThat(supplies[0].bundleId).isEqualTo("BUNDLE-001")
        assertThat(supplies[0].orderNumber).isEqualTo("FBO-12345")
        assertThat(supplies[0].state).isEqualTo("COMPLETED")

        val items = ozonFboSupplyItemRepository.findBySupplyId(supplies[0].id!!)
        assertThat(items).hasSize(1)
        assertThat(items[0].ozonSku).isEqualTo("333")
        assertThat(items[0].offerId).isEqualTo("art-green")
        assertThat(items[0].quantity).isEqualTo(5)
    }

    // ── Test 2: idempotency — re-sync does not duplicate supplies or items ──────

    @Test
    fun `startFboSync - called twice with same data - produces no duplicates`() {
        // First sync
        enqueue(fboListPage(listOf(12345L)))
        enqueue(fboGetResponse(fboOrder(12345L, "FBO-12345", "BUNDLE-001")))
        enqueue(fboBundlePage(bundleItem("333", "art-green", qty = 5)))
        runSync { ozonService.startFboSync(it) }

        assertThat(ozonFboSupplyRepository.count()).isEqualTo(1)
        assertThat(ozonFboSupplyItemRepository.count()).isEqualTo(1)

        // Second sync — same data
        enqueue(fboListPage(listOf(12345L)))
        enqueue(fboGetResponse(fboOrder(12345L, "FBO-12345", "BUNDLE-001")))
        enqueue(fboBundlePage(bundleItem("333", "art-green", qty = 5)))
        runSync { ozonService.startFboSync(it) }

        // Must still be exactly 1 supply and 1 item
        assertThat(ozonFboSupplyRepository.count()).isEqualTo(1)
        assertThat(ozonFboSupplyItemRepository.count()).isEqualTo(1)
    }

    // ── Test 3: items are refreshed on re-sync ─────────────────────────────────
    //
    // If items are deleted from the DB externally, the next sync must restore them.
    // This validates the delete-then-reinsert atomicity introduced in the fix.

    @Test
    fun `startFboSync - items deleted between syncs - re-sync restores correct items`() {
        // First sync: 2 items
        enqueue(fboListPage(listOf(12345L)))
        enqueue(fboGetResponse(fboOrder(12345L, "FBO-12345", "BUNDLE-001")))
        enqueue(fboBundlePage(
            bundleItem("111", "art-blue", qty = 3),
            bundleItem("222", "art-red",  qty = 2)
        ))
        runSync { ozonService.startFboSync(it) }

        val supplyId = ozonFboSupplyRepository.findAll()[0].id!!
        assertThat(ozonFboSupplyItemRepository.findBySupplyId(supplyId)).hasSize(2)

        // Simulate data corruption: manually delete one item
        val toDelete = ozonFboSupplyItemRepository.findBySupplyId(supplyId).first()
        ozonFboSupplyItemRepository.delete(toDelete)
        assertThat(ozonFboSupplyItemRepository.findBySupplyId(supplyId)).hasSize(1)

        // Second sync: must restore both items
        enqueue(fboListPage(listOf(12345L)))
        enqueue(fboGetResponse(fboOrder(12345L, "FBO-12345", "BUNDLE-001")))
        enqueue(fboBundlePage(
            bundleItem("111", "art-blue", qty = 3),
            bundleItem("222", "art-red",  qty = 2)
        ))
        runSync { ozonService.startFboSync(it) }

        val restoredItems = ozonFboSupplyItemRepository.findBySupplyId(supplyId)
        assertThat(restoredItems).hasSize(2)
        assertThat(restoredItems.map { it.ozonSku }).containsExactlyInAnyOrder("111", "222")
    }

    // ── Test 4: paginated order list — all pages are loaded ────────────────────

    @Test
    fun `startFboSync - order list spans two pages - all orders are synced`() {
        // Page 1: order 111, pagination cursor present → another page follows
        enqueue(fboListPage(orderIds = listOf(111L), lastId = "cursor-after-111"))
        // Page 2: order 222, no more pages
        enqueue(fboListPage(orderIds = listOf(222L), lastId = ""))

        // supply-order/get: both order IDs arrive in one chunk (< 50)
        enqueue(fboGetResponse(
            fboOrder(111L, "FBO-111", "BUNDLE-111"),
            fboOrder(222L, "FBO-222", "BUNDLE-222")
        ))

        // Bundles fetched in the order supplies appear in the response
        enqueue(fboBundlePage(bundleItem("111", "art-blue",  qty = 2)))
        enqueue(fboBundlePage(bundleItem("222", "art-red",   qty = 3)))

        runSync { ozonService.startFboSync(it) }

        assertThat(ozonFboSupplyRepository.count()).isEqualTo(2)
        assertThat(ozonFboSupplyRepository.findAll().map { it.bundleId })
            .containsExactlyInAnyOrder("BUNDLE-111", "BUNDLE-222")

        assertThat(ozonFboSupplyItemRepository.count()).isEqualTo(2)
        assertThat(ozonFboSupplyItemRepository.findAll().map { it.ozonSku })
            .containsExactlyInAnyOrder("111", "222")
    }

    // ── JSON helpers ───────────────────────────────────────────────────────────

    /**
     * /v3/supply-order/list response.
     * [lastId] non-empty → more pages follow; empty → last page.
     */
    private fun fboListPage(orderIds: List<Long>, lastId: String = ""): String =
        objectMapper.writeValueAsString(
            mapOf("result" to mapOf("order_ids" to orderIds, "last_id" to lastId))
        )

    /** /v3/supply-order/get response containing one or more orders. */
    private fun fboGetResponse(vararg orders: Map<String, Any?>): String =
        objectMapper.writeValueAsString(
            mapOf("result" to mapOf("orders" to orders.toList()))
        )

    /**
     * One order object matching the real /v3/supply-order/get response structure.
     * Contains a single supply with [bundleId].
     */
    private fun fboOrder(orderId: Long, orderNumber: String, bundleId: String): Map<String, Any?> =
        mapOf(
            "order_id"           to orderId,
            "order_number"       to orderNumber,
            "state"              to "COMPLETED",
            "created_date"       to "2026-01-15T07:00:00Z",
            "state_updated_date" to "2026-01-20T07:00:00Z",
            "supplies" to listOf(
                mapOf(
                    "supply_id" to 67890L,
                    "bundle_id" to bundleId,
                    "storage_warehouse" to mapOf(
                        "warehouse_id" to 100L,
                        "name"         to "Test Warehouse",
                        "address"      to "Moscow, Test",
                        "arrival_date" to "2026-01-20T07:00:00Z"
                    )
                )
            )
        )

    /** /v1/supply-order/bundle response with one or more items. */
    private fun fboBundlePage(
        vararg items: Map<String, Any?>,
        hasNext: Boolean = false
    ): String = objectMapper.writeValueAsString(
        mapOf("result" to mapOf("items" to items.toList(), "has_next" to hasNext, "last_id" to ""))
    )

    /** One item entry inside a bundle's `items` array. */
    private fun bundleItem(sku: String, offerId: String, qty: Int = 1): Map<String, Any?> = mapOf(
        "sku"      to sku,
        "offer_id" to offerId,
        "name"     to "Product $offerId",
        "quantity" to qty
    )
}
