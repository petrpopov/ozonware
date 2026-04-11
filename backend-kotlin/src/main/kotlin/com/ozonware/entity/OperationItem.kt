package com.ozonware.entity

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.LocalDateTime

@Entity
@Table(name = "operation_items")
data class OperationItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "operation_id", nullable = false)
    val operationId: Long,

    @Column(name = "product_id", nullable = false)
    val productId: Long,

    @Column(name = "requested_qty", nullable = false)
    var requestedQty: BigDecimal = BigDecimal.ZERO,

    @Column(name = "applied_qty")
    var appliedQty: BigDecimal? = null,

    @Column(name = "delta")
    var delta: BigDecimal? = null,

    @Column(name = "writeoff_reason_id")
    var writeoffReasonId: Long? = null,

    @Column(name = "writeoff_reason_text")
    var writeoffReasonText: String? = null,

    @Column(name = "product_name_snapshot", nullable = false)
    var productNameSnapshot: String = "",

    @Column(name = "product_sku_snapshot", nullable = false, length = 128)
    var productSkuSnapshot: String = "",

    @Column(name = "item_note")
    var itemNote: String? = null,

    @Column(name = "created_at", insertable = false, updatable = false)
    val createdAt: LocalDateTime? = null
)
