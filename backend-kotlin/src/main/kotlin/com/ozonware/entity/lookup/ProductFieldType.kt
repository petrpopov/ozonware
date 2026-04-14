package com.ozonware.entity.lookup

import jakarta.persistence.*

@Entity
@Table(name = "product_field_types")
data class ProductFieldType(
    @Id val code: String,
    val label: String,
    val widget: String,
    val stores: String
) : DictionaryEntry {
    override fun toMap() = mapOf(
        "code" to code,
        "label" to label,
        "widget" to widget,
        "stores" to stores
    )
}
