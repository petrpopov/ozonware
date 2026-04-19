package com.ozonware.dto.request

import com.fasterxml.jackson.annotation.JsonProperty

data class PlannedSupplyCreateRequest(
    val title: String = "",
    val supplier: String? = null,
    @JsonProperty("purchase_date") val purchaseDate: String? = null,
    @JsonProperty("expected_date") val expectedDate: String? = null,
    val note: String? = null,
    @JsonProperty("source_file") val sourceFile: String? = null,
    val items: List<ItemRequest> = emptyList()
) {
    data class ItemRequest(
        val sku: String = "",
        @JsonProperty("product_name") val productName: String? = null,
        @JsonProperty("planned_quantity") val plannedQuantity: Int = 0
    )
}
