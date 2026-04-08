package com.ozonware.entity

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type
import java.time.LocalDate
import java.time.LocalDateTime

@Entity
@Table(name = "operations")
data class Operation(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(nullable = false, length = 50)
    var type: String,

    @Column(name = "operation_date")
    var operationDate: LocalDate? = null,

    @Column(columnDefinition = "TEXT")
    var note: String? = null,

    @Type(JsonType::class)
    @Column(columnDefinition = "jsonb")
    var items: List<Map<String, Any?>> = emptyList(),

    @Column(name = "total_quantity")
    var totalQuantity: Int = 0,

    @Type(JsonType::class)
    @Column(columnDefinition = "jsonb")
    var differences: List<Map<String, Any?>> = emptyList(),

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
