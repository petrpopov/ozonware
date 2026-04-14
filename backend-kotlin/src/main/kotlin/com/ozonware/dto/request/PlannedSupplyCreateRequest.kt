package com.ozonware.dto.request

import com.fasterxml.jackson.annotation.JsonProperty

data class PlannedSupplyCreateRequest(
    val title: String = "",
    val supplier: String? = null,
    @JsonProperty("planned_date") val plannedDate: String? = null,
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
