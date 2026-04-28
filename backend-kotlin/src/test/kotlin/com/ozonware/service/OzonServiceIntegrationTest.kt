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
import java.time.LocalDateTime

/**
 * Integration tests for OzonService.
 *
 * createShipments() reads from ozon_postings.raw_data — no HTTP calls needed.
 * The test inserts postings directly into the DB and verifies the resulting operation.
 */
@Transactional
class OzonServiceIntegrationTest : IntegrationTestBase() {

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
        productFieldsService.ensureSystemField("Фото",    "ozon_photo",   "image")
        flush()
    }

    /**
     * Verifies that createShipments() for a day creates an operation with
     * note = "OZON FBS от $dayStr" and items populated from ozon_postings.raw_data.products.
     */
    @Test
    fun createShipmentsForDay_createsFbsOperation_withItems() {
        val ozonSku = "123456789"
        val ozonSkuFull = "OZN$ozonSku"

        val customFields = listOf(
            mapOf("name" to "OZON",         "value" to ozonSkuFull),
            mapOf("name" to "Артикул OZON", "value" to "ART-001")
        )
        val product = productRepository.save(
            Product(name = "Test Product", sku = "TP-001", quantity = 10)
        )
        productFieldsService.syncFieldValues(product.id!!, customFields)

        val moscowDate = LocalDate.of(2026, 1, 20)
        val inProcessAt = moscowDate.atTime(12, 0)

        ozonPostingRepository.save(
            OzonPosting(
                postingNumber = "FBS-TEST-001",
                orderNumber = "ORDER-001",
                status = "delivering",
                inProcessAt = inProcessAt,
                rawData = mapOf(
                    "products" to listOf(
                        mapOf(
                            "sku" to ozonSku,
                            "quantity" to 2,
                            "name" to "Test Product",
                            "offer_id" to "ART-001"
                        )
                    )
                )
            )
        )
        flush()

        val dayStr = moscowDate.toString()
        val result = ozonService.createShipments(listOf(dayStr))
        flush()

        @Suppress("UNCHECKED_CAST")
        val details = result["details"] as List<Map<String, Any?>>
        assertThat(details).hasSize(1)
        assertThat(details[0]["status"]).isEqualTo("success")
        assertThat(details[0]["itemsCount"]).isEqualTo(1)

        val opId = (details[0]["operationId"] as Number).toLong()
        val op = operationRepository.findById(opId).get()
        assertThat(op.note).isEqualTo("OZON FBS от $dayStr")
        assertThat(op.typeCode).isEqualTo("shipment")
        val opItems = operationItemRepository.findAllByOperationId(opId)
        assertThat(opItems).hasSize(1)
        assertThat(opItems[0].productId).isEqualTo(product.id)

        val updatedProduct = productRepository.findById(product.id!!).get()
        assertThat(updatedProduct.quantity).isEqualTo(8)

        val posting = ozonPostingRepository.findByPostingNumber("FBS-TEST-001").get()
        assertThat(posting.shipmentApplied).isTrue()
        assertThat(posting.shipmentOperationId).isEqualTo(opId)
    }
}
