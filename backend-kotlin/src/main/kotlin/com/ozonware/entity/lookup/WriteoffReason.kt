package com.ozonware.entity.lookup

import jakarta.persistence.*

@Entity
@Table(name = "writeoff_reasons")
data class WriteoffReason(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long? = null,
    val code: String,
    val label: String,
    @Column(name = "affects_stock") val affectsStock: Boolean = true,
    @Column(name = "is_system") val isSystem: Boolean = false,
    val position: Int = 0
) : DictionaryEntry {
    override fun toMap() = mapOf(
        "id" to id,
        "code" to code,
        "label" to label,
        "affects_stock" to affectsStock,
        "is_system" to isSystem,
        "position" to position
    )
}
