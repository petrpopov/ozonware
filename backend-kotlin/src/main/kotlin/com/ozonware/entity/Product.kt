package com.ozonware.entity

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type
import java.time.LocalDateTime

@Entity
@Table(name = "products")
data class Product(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(nullable = false)
    var name: String,

    @Column(unique = true, nullable = false, length = 100)
    var sku: String,

    @Column(nullable = false)
    var quantity: Int = 0,

    @Column(columnDefinition = "TEXT")
    var description: String = "",

    @Type(JsonType::class)
    @Column(columnDefinition = "jsonb")
    var customFields: List<Map<String, Any>> = emptyList(),

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
