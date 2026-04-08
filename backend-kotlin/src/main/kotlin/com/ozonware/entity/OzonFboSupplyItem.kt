package com.ozonware.entity

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type
import java.time.LocalDateTime

@Entity
@Table(name = "ozon_fbo_supply_items")
data class OzonFboSupplyItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "supply_id", nullable = false)
    var supplyId: Long = 0,

    @Column(name = "ozon_sku", nullable = false)
    var ozonSku: String = "",

    @Column(name = "product_id")
    var productId: Long? = null,

    @Column(nullable = false)
    var quantity: Int = 0,

    @Column(name = "product_name")
    var productName: String? = null,

    @Column(name = "offer_id")
    var offerId: String? = null,

    @Column(name = "icon_path")
    var iconPath: String? = null,

    @Type(JsonType::class)
    @Column(name = "raw_item", columnDefinition = "jsonb")
    var rawItem: Map<String, Any> = emptyMap(),

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
