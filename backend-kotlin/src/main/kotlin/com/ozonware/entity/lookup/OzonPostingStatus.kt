package com.ozonware.entity.lookup

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type

@Entity
@Table(name = "ozon_posting_statuses")
data class OzonPostingStatus(
    @Id val code: String,
    val label: String,
    @Column(name = "is_terminal") val isTerminal: Boolean = false,
    @Type(JsonType::class)
    @Column(name = "csv_aliases", columnDefinition = "jsonb")
    val csvAliases: List<String> = emptyList()
) : DictionaryEntry {
    override fun toMap() = mapOf(
        "code" to code,
        "label" to label,
        "is_terminal" to isTerminal,
        "csv_aliases" to csvAliases
    )
}
