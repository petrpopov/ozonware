package com.ozonware.entity

import jakarta.persistence.*
import java.time.LocalDateTime

@Entity
@Table(name = "writeoffs")
data class Writeoff(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    val product: Product? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "operation_id")
    val operation: Operation? = null,

    @Column(nullable = false)
    var quantity: Int = 0,

    @Column(nullable = false, length = 50)
    var reason: String = "",

    @Column(columnDefinition = "TEXT")
    var note: String? = null,

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
