package com.ozonware.entity

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type
import java.time.LocalDateTime

@Entity
@Table(name = "ozon_order_import_batches")
data class OzonOrderImportBatch(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(nullable = false, length = 32)
    var source: String = "",

    @Column(name = "file_name", columnDefinition = "TEXT")
    var fileName: String? = null,

    @Column(name = "imported_at", nullable = false)
    var importedAt: LocalDateTime = LocalDateTime.now(),

    @Column(name = "rows_total", nullable = false)
    var rowsTotal: Int = 0,

    @Column(name = "rows_saved", nullable = false)
    var rowsSaved: Int = 0,

    @Column(name = "rows_updated", nullable = false)
    var rowsUpdated: Int = 0,

    @Column(name = "rows_skipped", nullable = false)
    var rowsSkipped: Int = 0,

    @Column(name = "rows_unmatched", nullable = false)
    var rowsUnmatched: Int = 0,

    @Type(JsonType::class)
    @Column(columnDefinition = "jsonb", nullable = false)
    var summary: Map<String, Any> = emptyMap(),

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
