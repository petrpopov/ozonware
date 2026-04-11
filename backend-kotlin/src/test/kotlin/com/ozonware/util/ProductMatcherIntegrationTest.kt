package com.ozonware.util

import com.ozonware.IntegrationTestBase
import com.ozonware.entity.Product
import com.ozonware.repository.ProductRepository
import com.ozonware.service.ProductFieldsService
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.annotation.Transactional

@Transactional
class ProductMatcherIntegrationTest : IntegrationTestBase() {

    @Autowired lateinit var productMatcher: ProductMatcher
    @Autowired lateinit var productRepository: ProductRepository
    @Autowired lateinit var productFieldsService: ProductFieldsService
    @Autowired lateinit var entityManager: EntityManager

    private fun flush() {
        entityManager.flush()
        entityManager.clear()
    }

    @BeforeEach
    fun ensureSystemFields() {
        // Phase 2: system fields must exist so ProductMatcher can resolve by kind
        productFieldsService.ensureSystemField("Артикул OZON", "ozon_article", "text")
        productFieldsService.ensureSystemField("OZON",         "ozon_sku",     "text")
        flush()
    }

    private fun savedProduct(sku: String, qty: Int, customFields: List<Map<String, Any>>): Product {
        val p = productRepository.save(Product(name = "Test $sku", sku = sku, quantity = qty))
        productFieldsService.syncFieldValues(p.id!!, customFields)
        return p
    }

    @Test
    fun findByOfferId_usesCustomFieldsArticulOzon() {
        val offerId = "OFFER-XYZ-001"
        savedProduct("PA-001", 5, listOf(mapOf("name" to "Артикул OZON", "value" to offerId)))
        flush()

        val found = productMatcher.findProductByOzonOfferId(offerId)

        assertThat(found).isNotNull()
        assertThat(found!!.sku).isEqualTo("PA-001")
    }

    @Test
    fun findByOzonSku_usesCustomFieldsOzon() {
        val ozonSkuNum = "987654321"
        savedProduct("PB-001", 3, listOf(mapOf("name" to "OZON", "value" to "OZN$ozonSkuNum")))
        flush()

        val found = productMatcher.findProductByOzonSku(ozonSkuNum, null)

        assertThat(found).isNotNull()
        assertThat(found!!.sku).isEqualTo("PB-001")
    }

    @Test
    fun findByOzonSku_withMarkdownSuffix_fallsBackToOfferId() {
        val baseOfferId = "BASE-ART-001"
        savedProduct("PC-001", 7, listOf(mapOf("name" to "Артикул OZON", "value" to baseOfferId)))
        flush()

        val found = productMatcher.findProductByOzonSku("UNKNOWN-SKU", "${baseOfferId}_dm3")

        assertThat(found).isNotNull()
        assertThat(found!!.sku).isEqualTo("PC-001")
    }
}
