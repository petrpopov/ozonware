package com.ozonware.entity

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type
import java.time.LocalDateTime

@Entity
@Table(name = "ozon_postings")
data class OzonPosting(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "posting_number", unique = true, nullable = false)
    var postingNumber: String = "",

    @Column(name = "order_number")
    var orderNumber: String? = null,

    @Column(nullable = false)
    var status: String = "",

    @Column(name = "in_process_at")
    var inProcessAt: LocalDateTime? = null,

    @Type(JsonType::class)
    @Column(name = "raw_data", columnDefinition = "jsonb")
    var rawData: Map<String, Any?> = emptyMap(),

    @Column(nullable = false)
    var shipped: Boolean = false,

    @Column(name = "shipment_applied", nullable = false)
    var shipmentApplied: Boolean = false,

    @Column(name = "shipment_operation_id")
    var shipmentOperationId: Long? = null,

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
