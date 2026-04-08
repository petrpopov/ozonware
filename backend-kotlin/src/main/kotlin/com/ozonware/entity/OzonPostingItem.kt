package com.ozonware.entity

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type
import java.time.LocalDateTime

@Entity
@Table(name = "ozon_posting_items")
data class OzonPostingItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "posting_id", nullable = false)
    var postingId: Long = 0,

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

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
