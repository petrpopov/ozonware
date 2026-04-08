package com.ozonware.entity

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type
import java.time.LocalDateTime

@Entity
@Table(name = "ozon_fbo_supplies")
data class OzonFboSupply(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "order_id", nullable = false)
    var orderId: Long = 0,

    @Column(name = "order_number")
    var orderNumber: String? = null,

    @Column(name = "state")
    var state: String? = null,

    @Column(name = "order_created_date")
    var orderCreatedDate: LocalDateTime? = null,

    @Column(name = "state_updated_date")
    var stateUpdatedDate: LocalDateTime? = null,

    @Column(name = "supply_id")
    var supplyId: Long? = null,

    @Column(name = "bundle_id", unique = true, nullable = false)
    var bundleId: String = "",

    @Column(name = "arrival_date")
    var arrivalDate: LocalDateTime? = null,

    @Column(name = "warehouse_id")
    var warehouseId: Long? = null,

    @Column(name = "warehouse_name")
    var warehouseName: String? = null,

    @Column(name = "warehouse_address")
    var warehouseAddress: String? = null,

    @Type(JsonType::class)
    @Column(name = "raw_order", columnDefinition = "jsonb")
    var rawOrder: Map<String, Any> = emptyMap(),

    @Type(JsonType::class)
    @Column(name = "raw_supply", columnDefinition = "jsonb")
    var rawSupply: Map<String, Any> = emptyMap(),

    @Column(name = "shipment_applied")
    var shipmentApplied: Boolean = false,

    @Column(name = "shipment_operation_id")
    var shipmentOperationId: Long? = null,

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
