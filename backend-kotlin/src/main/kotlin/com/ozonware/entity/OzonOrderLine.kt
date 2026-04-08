package com.ozonware.entity

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type
import java.math.BigDecimal
import java.time.LocalDateTime

@Entity
@Table(name = "ozon_order_lines")
data class OzonOrderLine(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "external_line_key", unique = true, nullable = false)
    var externalLineKey: String = "",

    @Column(name = "batch_id")
    var batchId: Long? = null,

    @Column(nullable = false, length = 32)
    var source: String = "",

    @Column(name = "order_number")
    var orderNumber: String? = null,

    @Column(name = "posting_number", nullable = false)
    var postingNumber: String = "",

    @Column(name = "accepted_at")
    var acceptedAt: LocalDateTime? = null,

    @Column(name = "shipment_date")
    var shipmentDate: LocalDateTime? = null,

    @Column(name = "shipment_deadline")
    var shipmentDeadline: LocalDateTime? = null,

    @Column(name = "transfer_at")
    var transferAt: LocalDateTime? = null,

    @Column(name = "delivery_date")
    var deliveryDate: LocalDateTime? = null,

    @Column(name = "cancellation_date")
    var cancellationDate: LocalDateTime? = null,

    @Column(name = "status")
    var status: String? = null,

    @Column(name = "product_name")
    var productName: String? = null,

    @Column(name = "ozon_sku")
    var ozonSku: String? = null,

    @Column(name = "offer_id")
    var offerId: String? = null,

    @Column(nullable = false)
    var quantity: Int = 0,

    @Column(name = "your_price")
    var yourPrice: BigDecimal? = null,

    @Column(name = "paid_by_customer")
    var paidByCustomer: BigDecimal? = null,

    @Column(name = "shipment_amount")
    var shipmentAmount: BigDecimal? = null,

    @Column(name = "currency")
    var currency: String? = null,

    @Column(name = "discount_percent")
    var discountPercent: String? = null,

    @Column(name = "discount_rub")
    var discountRub: BigDecimal? = null,

    @Column(name = "shipping_cost")
    var shippingCost: BigDecimal? = null,

    @Column(name = "promotions")
    var promotions: String? = null,

    @Column(name = "volumetric_weight_kg")
    var volumetricWeightKg: BigDecimal? = null,

    @Column(name = "product_id")
    var productId: Long? = null,

    @Column(name = "matched_by")
    var matchedBy: String? = null,

    @Type(JsonType::class)
    @Column(columnDefinition = "jsonb", nullable = false)
    var raw: Map<String, Any?> = emptyMap(),

    @Column(name = "created_at", nullable = false)
    var createdAt: LocalDateTime = LocalDateTime.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: LocalDateTime = LocalDateTime.now()
)
