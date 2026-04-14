package com.ozonware.dto.ozon

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty

@JsonIgnoreProperties(ignoreUnknown = true)
data class OzonPostingDto(
    @JsonProperty("posting_number") val postingNumber: String = "",
    @JsonProperty("order_number") val orderNumber: String? = null,
    val status: String = "",
    @JsonProperty("in_process_at") val inProcessAt: String? = null
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class OzonPostingItemDto(
    val sku: String = "",
    @JsonProperty("offer_id") val offerId: String? = null,
    val quantity: Int = 0,
    val name: String? = null
)
