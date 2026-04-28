package com.ozonware.dto.request

import com.fasterxml.jackson.annotation.JsonProperty

data class ProductCatalogImportRequest(
    val items: List<CatalogItem> = emptyList()
) {
    data class CatalogItem(
        val sku: String = "",
        val name: String = "",
        val description: String = "",
        @JsonProperty("default_box_size") val defaultBoxSize: Int? = null,
        @JsonProperty("custom_fields") val customFields: List<Map<String, Any>> = emptyList()
    )
}
