package com.ozonware.dto.ozon

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty

@JsonIgnoreProperties(ignoreUnknown = true)
data class OzonFboOrderDto(
    @JsonProperty("order_id") val orderId: Long? = null,
    @JsonProperty("order_number") val orderNumber: String? = null,
    val state: String? = null,
    @JsonProperty("created_date") val createdDate: String? = null,
    @JsonProperty("state_updated_date") val stateUpdatedDate: String? = null
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class OzonFboWarehouseDto(
    @JsonProperty("arrival_date") val arrivalDate: String? = null,
    @JsonProperty("warehouse_id") val warehouseId: Long? = null,
    val name: String? = null,
    val address: String? = null
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class OzonFboSupplyNodeDto(
    @JsonProperty("bundle_id") val bundleId: String? = null,
    @JsonProperty("supply_id") val supplyId: Long? = null,
    val state: String? = null
)

/** Aggregate DTO — combines flattened fields from order, supply, and warehouse nodes. */
data class OzonFboSupplyDto(
    val order: OzonFboOrderDto,
    val supply: OzonFboSupplyNodeDto,
    val warehouse: OzonFboWarehouseDto?,
    val rawOrder: Map<String, Any?>,
    val rawSupply: Map<String, Any?>
) {
    val bundleId: String get() = supply.bundleId ?: ""
}

@JsonIgnoreProperties(ignoreUnknown = true)
data class OzonFboSupplyItemDto(
    val sku: String = "",
    @JsonProperty("offer_id") val offerId: String? = null,
    val quantity: Int = 0,
    val name: String? = null,
    @JsonProperty("icon_path") val iconPath: String? = null
)
