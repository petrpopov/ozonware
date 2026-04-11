package com.ozonware.util

import com.ozonware.entity.Product
import com.ozonware.repository.ProductFieldValueRepository
import com.ozonware.repository.ProductRepository
import org.springframework.stereotype.Component

@Component
class ProductMatcher(
    private val productRepository: ProductRepository,
    private val productFieldValueRepository: ProductFieldValueRepository
) {

    data class LookupCache(
        val byOffer: Map<String, Product>,
        val byOzonSku: Map<String, Product>,
        val bySku: Map<String, Product>
    )

    fun buildLookupCache(): LookupCache {
        val products = productRepository.findAll()
        val productById = products.associateBy { it.id }
        val bySku = products.associateBy { it.sku.lowercase() }

        val articleValues = productFieldValueRepository.findAllByFieldKind("ozon_article")
        val byOffer = articleValues
            .filter { !it.valueText.isNullOrBlank() }
            .mapNotNull { pfv ->
                val product = productById[pfv.productId] ?: return@mapNotNull null
                pfv.valueText!!.lowercase().trim() to product
            }.toMap()

        val skuValues = productFieldValueRepository.findAllByFieldKind("ozon_sku")
        val byOzonSku = skuValues
            .filter { !it.valueText.isNullOrBlank() }
            .mapNotNull { pfv ->
                val product = productById[pfv.productId] ?: return@mapNotNull null
                normalizeOzonSku(pfv.valueText!!) to product
            }.toMap()

        return LookupCache(byOffer, byOzonSku, bySku)
    }

    fun findProductByOzonSku(ozonSku: String, offerId: String?, cache: LookupCache? = null): Product? {
        val effectiveCache = cache ?: buildLookupCache()
        val skuString = ozonSku.trim()
        val searchValue = if (skuString.startsWith("OZN", ignoreCase = true)) skuString else "OZN$skuString"

        val cached = effectiveCache.byOzonSku[normalizeOzonSku(searchValue)]
        if (cached != null) return cached

        if (offerId.isNullOrBlank()) return null
        val trimmedOffer = offerId.trim()
        if (trimmedOffer.isEmpty()) return null

        val offerCached = effectiveCache.byOffer[trimmedOffer.lowercase()]
        if (offerCached != null) return offerCached

        // Fallback: markdown suffix _dm or _dm###
        val dmRegex = Regex("(_dm\\d*)$", RegexOption.IGNORE_CASE)
        if (dmRegex.containsMatchIn(trimmedOffer)) {
            val art = dmRegex.replace(trimmedOffer, "")
            val pfv = productFieldValueRepository.findAllByFieldKind("ozon_article")
                .firstOrNull { it.valueText?.trim() == art }
            if (pfv != null) return productRepository.findById(pfv.productId).orElse(null)
        }

        return null
    }

    fun findProductByOzonOfferId(offerId: String): Product? {
        val trimmed = offerId.trim()
        val pfv = productFieldValueRepository.findAllByFieldKind("ozon_article")
            .firstOrNull { it.valueText?.trim() == trimmed }
        return pfv?.let { productRepository.findById(it.productId).orElse(null) }
    }

    private fun normalizeOzonSku(value: String): String {
        val raw = value.replace(Regex("^ozn", RegexOption.IGNORE_CASE), "")
        return raw.replace(Regex("\\s+"), "")
    }
}
