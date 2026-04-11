package com.ozonware.entity

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.LocalDateTime

@Entity
@Table(name = "operation_inventory_diffs")
data class OperationInventoryDiff(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "operation_id", nullable = false)
    val operationId: Long,

    @Column(name = "product_id", nullable = false)
    val productId: Long,

    @Column(nullable = false)
    var expected: BigDecimal = BigDecimal.ZERO,

    @Column(nullable = false)
    var actual: BigDecimal = BigDecimal.ZERO,

    // diff is GENERATED ALWAYS AS (actual - expected) STORED — do NOT write to it
    @Column(insertable = false, updatable = false)
    val diff: BigDecimal? = null,

    @Column(name = "product_name_snapshot", nullable = false)
    var productNameSnapshot: String = "",

    @Column(name = "product_sku_snapshot", nullable = false, length = 128)
    var productSkuSnapshot: String = "",

    @Column(name = "created_at", insertable = false, updatable = false)
    val createdAt: LocalDateTime? = null
)
