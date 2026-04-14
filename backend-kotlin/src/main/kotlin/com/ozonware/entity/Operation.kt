package com.ozonware.entity

import jakarta.persistence.*
import java.time.LocalDate
import java.time.LocalDateTime

@Entity
@Table(name = "operations")
data class Operation(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "type_code", nullable = false, length = 32)
    var typeCode: String = "",

    @Column(name = "channel_code", nullable = false, length = 32)
    var channelCode: String = "manual",

    @Column(name = "parent_operation_id")
    var parentOperationId: Long? = null,

    @Column(name = "correction_reason_id")
    var correctionReasonId: Long? = null,

    @Column(name = "operation_date")
    var operationDate: LocalDate? = null,

    @Column(columnDefinition = "TEXT")
    var note: String? = null,

    @Column(name = "total_quantity")
    var totalQuantity: Int = 0,

    @Column(name = "planned_supply_id")
    var plannedSupplyId: Long? = null,

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
