package com.ozonware.dto.ozon

import com.fasterxml.jackson.annotation.JsonProperty

data class OzonProductItemDto(
    @JsonProperty("offer_id") val offerId: String = ""
)

data class OzonProductDetailDto(
    @JsonProperty("offer_id") val offerId: String = "",
    @JsonProperty("primary_image") val primaryImage: String? = null
)
