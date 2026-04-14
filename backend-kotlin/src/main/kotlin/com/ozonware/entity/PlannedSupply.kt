package com.ozonware.entity

import jakarta.persistence.*
import java.time.LocalDate
import java.time.LocalDateTime

@Entity
@Table(name = "planned_supplies")
data class PlannedSupply(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(nullable = false, length = 255)
    var title: String = "",

    @Column(length = 255)
    var supplier: String? = null,

    @Column(name = "planned_date")
    var plannedDate: LocalDate? = null,

    @Column(columnDefinition = "TEXT")
    var note: String? = null,

    @Column(name = "source_file", length = 255)
    var sourceFile: String? = null,

    @Column(nullable = false, length = 32)
    var status: String = "planned",

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
