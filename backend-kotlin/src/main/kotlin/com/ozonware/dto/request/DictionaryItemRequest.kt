package com.ozonware.dto.request

import com.fasterxml.jackson.annotation.JsonProperty

data class DictionaryItemRequest(
    val code: String? = null,
    val label: String? = null,
    @JsonProperty("affects_stock") val affectsStock: Boolean = true,
    val name: String? = null,
    val address: String? = null
)
