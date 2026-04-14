package com.ozonware.entity

import jakarta.persistence.*

@Entity
@Table(name = "planned_supply_items")
data class PlannedSupplyItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "planned_supply_id", nullable = false)
    var plannedSupplyId: Long = 0,

    @Column(name = "product_id")
    var productId: Long? = null,

    @Column(nullable = false, length = 255)
    var sku: String = "",

    @Column(name = "product_name", length = 512)
    var productName: String? = null,

    @Column(name = "planned_quantity", nullable = false)
    var plannedQuantity: Int = 0
)
