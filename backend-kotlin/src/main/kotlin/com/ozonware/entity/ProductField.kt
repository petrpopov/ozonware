package com.ozonware.entity

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type
import java.time.LocalDateTime

@Entity
@Table(name = "product_fields")
data class ProductField(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(nullable = false)
    var name: String,

    @Column(nullable = false, length = 50)
    var type: String,

    @Column(nullable = false)
    var required: Boolean = false,

    @Column(name = "show_in_table", nullable = false)
    var showInTable: Boolean = true,

    @Type(JsonType::class)
    @Column(columnDefinition = "jsonb")
    var options: List<String> = emptyList(),

    @Column(nullable = false)
    var position: Int = 0,

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
