package com.ozonware.util

import com.ozonware.entity.Product
import com.ozonware.repository.ProductRepository
import com.ozonware.service.SystemFieldAccessor
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/** Matches OZON API products to internal [Product] entities by OZON SKU, offer_id, or internal SKU. */
@Component
class ProductMatcher(
    private val productRepository: ProductRepository,
    private val systemFieldAccessor: SystemFieldAccessor
) {
    companion object {
        private val log = LoggerFactory.getLogger(ProductMatcher::class.java)
    }

    data class LookupCache(
        val byOffer: Map<String, Product>,
        val byOzonSku: Map<String, Product>,
        val bySku: Map<String, Product>
    )

    fun buildLookupCache(): LookupCache {
        val products = productRepository.findAll()
        val productById = products.associateBy { it.id }
        val bySku = products.associateBy { it.sku.lowercase() }

        val articleValues = systemFieldAccessor.findAllValues(SystemFieldKind.OZON_ARTICLE)
        val byOffer = articleValues
            .filter { !it.valueText.isNullOrBlank() }
            .mapNotNull { pfv ->
                val product = productById[pfv.productId] ?: return@mapNotNull null
                pfv.valueText!!.lowercase().trim() to product
            }.toMap()

        val skuValues = systemFieldAccessor.findAllValues(SystemFieldKind.OZON_SKU)
        val byOzonSku = skuValues
            .filter { !it.valueText.isNullOrBlank() }
            .mapNotNull { pfv ->
                val product = productById[pfv.productId] ?: return@mapNotNull null
                normalizeOzonSku(pfv.valueText!!) to product
            }.toMap()

        log.info("[ProductMatcher] cache built: byOzonSku=${byOzonSku.size}, byOffer=${byOffer.size}, bySku=${bySku.size}")
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

        // Fallback: offer_id совпадает с внутренним SKU товара
        val bySkuOffer = effectiveCache.bySku[trimmedOffer.lowercase()]
        if (bySkuOffer != null) return bySkuOffer

        // Fallback: markdown suffix _dm or _dm###
        val dmRegex = Regex("(_dm\\d*)$", RegexOption.IGNORE_CASE)
        if (dmRegex.containsMatchIn(trimmedOffer)) {
            val art = dmRegex.replace(trimmedOffer, "")
            val pfv = systemFieldAccessor.findAllValues(SystemFieldKind.OZON_ARTICLE)
                .firstOrNull { it.valueText?.trim() == art }
            if (pfv != null) return productRepository.findById(pfv.productId).orElse(null)
        }

        return null
    }

    fun findProductByOzonOfferId(offerId: String): Product? {
        val trimmed = offerId.trim()
        val pfv = systemFieldAccessor.findAllValues(SystemFieldKind.OZON_ARTICLE)
            .firstOrNull { it.valueText?.trim() == trimmed }
        return pfv?.let { productRepository.findById(it.productId).orElse(null) }
    }

    private fun normalizeOzonSku(value: String): String {
        val raw = value.replace(Regex("^ozn", RegexOption.IGNORE_CASE), "")
        return raw.replace(Regex("\\s+"), "")
    }
}
