package com.ozonware.dto.ozon

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty

@JsonIgnoreProperties(ignoreUnknown = true)
data class OzonProductItemDto(
    @JsonProperty("offer_id") val offerId: String = ""
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class OzonProductDetailDto(
    @JsonProperty("offer_id") val offerId: String = "",
    @JsonProperty("primary_image") val primaryImage: String? = null
)
