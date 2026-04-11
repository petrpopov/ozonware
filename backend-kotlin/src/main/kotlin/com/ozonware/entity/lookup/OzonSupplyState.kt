package com.ozonware.entity.lookup

import jakarta.persistence.*

@Entity
@Table(name = "ozon_supply_states")
data class OzonSupplyState(
    @Id val code: String,
    val label: String,
    @Column(name = "is_terminal") val isTerminal: Boolean = false
) {
    fun toMap() = mapOf(
        "code" to code,
        "label" to label,
        "is_terminal" to isTerminal
    )
}
