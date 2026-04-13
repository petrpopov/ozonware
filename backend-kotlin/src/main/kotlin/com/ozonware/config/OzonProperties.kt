package com.ozonware.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component

@Component
@ConfigurationProperties(prefix = "ozon")
data class OzonProperties(
    var requestPauseMs: Long = 1500,
    var apiUrl: String = "https://api-seller.ozon.ru/v3/posting/fbs/list",
    var fboListUrl: String = "https://api-seller.ozon.ru/v3/supply-order/list",
    var fboGetUrl: String = "https://api-seller.ozon.ru/v3/supply-order/get",
    var fboBundleUrl: String = "https://api-seller.ozon.ru/v1/supply-order/bundle",
    var productListUrl: String = "https://api-seller.ozon.ru/v3/product/list",
    var productAttributesUrl: String = "https://api-seller.ozon.ru/v4/product/info/attributes"
)
