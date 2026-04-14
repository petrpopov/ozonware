package com.ozonware.dto.request

import com.fasterxml.jackson.annotation.JsonProperty

data class ProductFieldCreateRequest(
    val name: String = "",
    val type: String = "",
    val required: Boolean = false,
    @JsonProperty("show_in_table") val showInTable: Boolean = true,
    val options: List<String> = emptyList(),
    val position: Int = 0
)
