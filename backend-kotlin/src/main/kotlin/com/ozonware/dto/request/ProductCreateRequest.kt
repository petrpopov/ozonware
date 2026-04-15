package com.ozonware.dto.request

import com.fasterxml.jackson.annotation.JsonProperty

data class ProductCreateRequest(
    val name: String = "",
    val sku: String = "",
    val quantity: Int = 0,
    val description: String = "",
    @JsonProperty("default_box_size") val defaultBoxSize: Int? = null,
    @JsonProperty("custom_fields") val customFields: List<Map<String, Any>> = emptyList()
)
