package com.ozonware.dto.request

import com.fasterxml.jackson.annotation.JsonProperty

data class ProductUpdateRequest(
    val name: String = "",
    val sku: String = "",
    val quantity: Int = 0,
    val description: String = "",
    @JsonProperty("custom_fields") val customFields: List<Map<String, Any>> = emptyList()
)
