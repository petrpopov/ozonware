package com.ozonware.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "ozon")
data class OzonProperties(
    val requestPauseMs: Long = 1500,
    val apiUrl: String = "https://api-seller.ozon.ru/v3/posting/fbs/list",
    val fboListUrl: String = "https://api-seller.ozon.ru/v3/supply-order/list",
    val fboGetUrl: String = "https://api-seller.ozon.ru/v3/supply-order/get",
    val fboBundleUrl: String = "https://api-seller.ozon.ru/v1/supply-order/bundle",
    val productListUrl: String = "https://api-seller.ozon.ru/v3/product/list",
    val productAttributesUrl: String = "https://api-seller.ozon.ru/v4/product/info/attributes"
)
