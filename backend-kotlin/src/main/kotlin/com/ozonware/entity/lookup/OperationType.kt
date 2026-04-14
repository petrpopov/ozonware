package com.ozonware.entity.lookup

import jakarta.persistence.*

@Entity
@Table(name = "operation_types")
data class OperationType(
    @Id val code: String,
    val label: String,
    @Column(name = "affects_stock_sign") val affectsStockSign: Int,
    val position: Int = 0
) : DictionaryEntry {
    override fun toMap() = mapOf(
        "code" to code,
        "label" to label,
        "affects_stock_sign" to affectsStockSign,
        "position" to position
    )
}
