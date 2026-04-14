package com.ozonware.entity.lookup

import jakarta.persistence.*
import java.time.LocalDateTime

@Entity
@Table(name = "warehouses")
data class Warehouse(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long? = null,
    @Column(name = "ozon_warehouse_id") val ozonWarehouseId: Long? = null,
    val name: String,
    val address: String? = null,
    @Column(name = "created_at") val createdAt: LocalDateTime? = null,
    @Column(name = "updated_at") val updatedAt: LocalDateTime? = null
) : DictionaryEntry {
    override fun toMap() = mapOf(
        "id" to id,
        "ozon_warehouse_id" to ozonWarehouseId,
        "name" to name,
        "address" to address,
        "created_at" to createdAt?.toString(),
        "updated_at" to updatedAt?.toString()
    )
}
