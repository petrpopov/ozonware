package com.ozonware.entity

import jakarta.persistence.*
import java.math.BigDecimal

@Entity
@Table(name = "product_field_values")
data class ProductFieldValue(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "product_id", nullable = false)
    val productId: Long,

    @Column(name = "field_id", nullable = false)
    val fieldId: Long,

    @Column(name = "value_text")
    var valueText: String? = null,

    @Column(name = "value_number")
    var valueNumber: BigDecimal? = null,

    @Column(name = "value_color", length = 16)
    var valueColor: String? = null,

    @Column(name = "value_option_id")
    var valueOptionId: Long? = null
)
