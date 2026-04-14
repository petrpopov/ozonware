package com.ozonware.dto.request

import com.fasterxml.jackson.annotation.JsonProperty

data class OperationCreateRequest(
    val type: String = "",
    @JsonProperty("operation_date") val operationDate: String? = null,
    val note: String? = null,
    val items: List<Map<String, Any?>>? = null,
    @JsonProperty("total_quantity") val totalQuantity: Int? = null,
    val differences: List<Map<String, Any?>>? = null,
    @JsonProperty("allow_shortage") val allowShortage: Boolean? = null,
    @JsonProperty("shortage_adjustments") val shortageAdjustments: List<Map<String, Any?>>? = null
)
