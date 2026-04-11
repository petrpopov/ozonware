package com.ozonware.entity.lookup

import jakarta.persistence.*

@Entity
@Table(name = "operation_channels")
data class OperationChannel(
    @Id val code: String,
    val label: String
) {
    fun toMap() = mapOf(
        "code" to code,
        "label" to label
    )
}
