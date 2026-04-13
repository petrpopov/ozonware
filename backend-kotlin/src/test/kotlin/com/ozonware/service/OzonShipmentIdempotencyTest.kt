package com.ozonware.service

import com.ozonware.IntegrationTestBase
import com.ozonware.entity.OzonPosting
import com.ozonware.entity.Product
import com.ozonware.repository.OperationItemRepository
import com.ozonware.repository.OperationRepository
import com.ozonware.repository.OzonPostingRepository
import com.ozonware.repository.ProductRepository
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

/**
 * P2.11 — Double-deduction regression test.
 *
 * Scenario: calling createShipments() twice for the same day must NOT
 * deduct stock twice. The second call should update the existing operation
 * (rollback old qty, re-apply new total), not create a second deduction.
 *
 * Flow:
 *  1. Product qty=10, one posting of 2 units → createShipments → qty should be 8
 *  2. Add a second posting of 3 units for the same day (day total = 5 units)
 *  3. createShipments again for same day → qty should be 5 (not 3!)
 *  4. Only one shipment operation must exist for that day
 */
@Transactional
class OzonShipmentIdempotencyTest : IntegrationTestBase() {

    @Autowired lateinit var ozonService: OzonService
    @Autowired lateinit var productFieldsService: ProductFieldsService
    @Autowired lateinit var productRepository: ProductRepository
    @Autowired lateinit var ozonPostingRepository: OzonPostingRepository
    @Autowired lateinit var operationRepository: OperationRepository
    @Autowired lateinit var operationItemRepository: OperationItemRepository
    @Autowired lateinit var entityManager: EntityManager

    private fun flush() {
        entityManager.flush()
        entityManager.clear()
    }

    @BeforeEach
    fun ensureSystemFields() {
        productFieldsService.ensureSystemField("OZON",         "ozon_sku",     "text")
        productFieldsService.ensureSystemField("Артикул OZON", "ozon_article", "text")
        productFieldsService.ensureSystemField("Фото OZON",    "ozon_photo",   "image")
        flush()
    }

    @Test
    fun createShipments_calledTwiceForSameDay_doesNotDoubleDeductStock() {
        val ozonSku = "987654321"
        val ozonSkuFull = "OZN$ozonSku"
        val initialQty = 10

        val product = productRepository.save(
            Product(name = "Idempotency Test Product", sku = "ITP-001", quantity = initialQty)
        )
        productFieldsService.syncFieldValues(
            product.id!!,
            listOf(
                mapOf("name" to "OZON",         "value" to ozonSkuFull),
                mapOf("name" to "Артикул OZON", "value" to "ITP-ART-001")
            )
        )

        val day = LocalDate.of(2026, 2, 15)
        val dayStr = day.toString()

        // --- First call: 1 posting × 2 units ---
        ozonPostingRepository.save(
            OzonPosting(
                postingNumber = "FBS-IDEM-001",
                orderNumber   = "ORDER-IDEM-001",
                status        = "delivering",
                inProcessAt   = day.atTime(10, 0),
                rawData       = mapOf(
                    "products" to listOf(
                        mapOf("sku" to ozonSku, "quantity" to 2,
                              "name" to "Idempotency Test Product", "offer_id" to "ITP-ART-001")
                    )
                )
            )
        )
        flush()

        val result1 = ozonService.createShipments(listOf(dayStr))
        flush()

        @Suppress("UNCHECKED_CAST")
        val details1 = result1["details"] as List<Map<String, Any?>>
        assertThat(details1[0]["status"]).isEqualTo("success")

        val qtyAfterFirst = productRepository.findById(product.id!!).get().quantity
        assertThat(qtyAfterFirst).isEqualTo(initialQty - 2) // 8

        val opIdFirst = (details1[0]["operationId"] as Number).toLong()

        // --- Second call: add a 2nd posting of 3 units (day total = 5 units) ---
        ozonPostingRepository.save(
            OzonPosting(
                postingNumber = "FBS-IDEM-002",
                orderNumber   = "ORDER-IDEM-002",
                status        = "delivering",
                inProcessAt   = day.atTime(14, 0),
                rawData       = mapOf(
                    "products" to listOf(
                        mapOf("sku" to ozonSku, "quantity" to 3,
                              "name" to "Idempotency Test Product", "offer_id" to "ITP-ART-001")
                    )
                )
            )
        )
        flush()

        val result2 = ozonService.createShipments(listOf(dayStr))
        flush()

        @Suppress("UNCHECKED_CAST")
        val details2 = result2["details"] as List<Map<String, Any?>>
        assertThat(details2[0]["status"]).isIn("success", "replaced")

        // Stock must be 10 - 5 = 5, NOT 8 - 5 = 3 (which would be double-deduction)
        val qtyAfterSecond = productRepository.findById(product.id!!).get().quantity
        assertThat(qtyAfterSecond)
            .withFailMessage(
                "Expected qty=5 (10 - total 5 units) but got $qtyAfterSecond. " +
                "If 3, double-deduction occurred (8 - 5 instead of 10 - 5)."
            )
            .isEqualTo(initialQty - 5) // 5

        // Only one shipment operation must exist for that day (update path, not two inserts)
        val ops = operationRepository.findByTypeCodeAndChannelCodeAndOperationDate(
            "shipment", "ozon_fbs", day
        )
        assertThat(ops)
            .withFailMessage("Expected exactly 1 shipment operation for day $dayStr but found ${ops.size}")
            .hasSize(1)

        val opId = ops[0].id!!
        assertThat(opId).isEqualTo(opIdFirst) // same operation updated, not recreated

        // Operation items must reflect the combined 5 units (one item for our product)
        val items = operationItemRepository.findAllByOperationId(opId)
        assertThat(items).hasSize(1)
        assertThat(items[0].productId).isEqualTo(product.id)
        assertThat(items[0].requestedQty.toInt()).isEqualTo(5)

        // Both postings must be marked applied and linked to the same operation
        val p1 = ozonPostingRepository.findByPostingNumber("FBS-IDEM-001").get()
        val p2 = ozonPostingRepository.findByPostingNumber("FBS-IDEM-002").get()
        assertThat(p1.shipmentApplied).isTrue()
        assertThat(p2.shipmentApplied).isTrue()
        assertThat(p1.shipmentOperationId).isEqualTo(opId)
        assertThat(p2.shipmentOperationId).isEqualTo(opId)
    }
}
