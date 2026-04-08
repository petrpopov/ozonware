package com.ozonware.util

import com.ozonware.entity.Product
import com.ozonware.repository.ProductRepository
import org.springframework.stereotype.Component

@Component
class ProductMatcher(
    private val productRepository: ProductRepository
) {

    data class LookupCache(
        val byOffer: Map<String, Product>,
        val byOzonSku: Map<String, Product>,
        val bySku: Map<String, Product>
    )

    fun buildLookupCache(): LookupCache {
        val products = productRepository.findAll()
        val byOffer = mutableMapOf<String, Product>()
        val byOzonSku = mutableMapOf<String, Product>()
        val bySku = mutableMapOf<String, Product>()

        for (product in products) {
            bySku[product.sku.lowercase()] = product
            for (field in product.customFields) {
                val fieldName = (field["name"] as? String)?.lowercase() ?: continue
                val fieldValue = field["value"] as? String ?: continue
                if (fieldValue.isBlank()) continue

                when (fieldName) {
                    "артикул ozon" -> byOffer[fieldValue.lowercase().trim()] = product
                    "ozon" -> byOzonSku[normalizeOzonSku(fieldValue)] = product
                }
            }
        }

        return LookupCache(byOffer, byOzonSku, bySku)
    }

    fun findProductByOzonSku(ozonSku: String, offerId: String?, cache: LookupCache? = null): Product? {
        val effectiveCache = cache ?: buildLookupCache()
        val skuString = ozonSku.trim()
        val searchValue = if (skuString.startsWith("OZN", ignoreCase = true)) skuString else "OZN$skuString"

        // Try exact match in cache
        val cached = effectiveCache.byOzonSku[normalizeOzonSku(searchValue)]
        if (cached != null) return cached

        // Fallback: query DB using jsonb_array_elements
        val dbResult = productRepository.findAll().firstOrNull { product ->
            product.customFields.any { field ->
                (field["name"] as? String) == "OZON" && (field["value"] as? String) == searchValue
            }
        }
        if (dbResult != null) return dbResult

        if (offerId.isNullOrBlank()) return null

        val trimmedOffer = offerId.trim()
        if (trimmedOffer.isEmpty()) return null

        // Try offer_id match
        val offerCached = effectiveCache.byOffer[trimmedOffer.lowercase()]
        if (offerCached != null) return offerCached

        // Fallback for markdown: suffix _dm or _dm###
        val dmRegex = Regex("(_dm\\d*)$", RegexOption.IGNORE_CASE)
        if (dmRegex.containsMatchIn(trimmedOffer)) {
            val art = dmRegex.replace(trimmedOffer, "")

            val dbResult2 = productRepository.findAll().firstOrNull { product ->
                product.customFields.any { field ->
                    (field["name"] as? String) == "Артикул OZON" && (field["value"] as? String) == art
                }
            }
            if (dbResult2 != null) return dbResult2
        }

        return null
    }

    fun findProductByOzonOfferId(offerId: String): Product? {
        return productRepository.findAll().firstOrNull { product ->
            product.customFields.any { field ->
                (field["name"] as? String) == "Артикул OZON" && (field["value"] as? String) == offerId.trim()
            }
        }
    }

    private fun normalizeOzonSku(value: String): String {
        val raw = value.replace(Regex("^ozn", RegexOption.IGNORE_CASE), "")
        return raw.replace(Regex("\\s+"), "")
    }
}
