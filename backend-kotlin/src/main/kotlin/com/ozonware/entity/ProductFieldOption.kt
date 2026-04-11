package com.ozonware.entity

import jakarta.persistence.*

@Entity
@Table(name = "product_field_options")
data class ProductFieldOption(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "field_id", nullable = false)
    val fieldId: Long,

    @Column(nullable = false)
    var label: String,

    @Column(nullable = false)
    var position: Int = 0
)
