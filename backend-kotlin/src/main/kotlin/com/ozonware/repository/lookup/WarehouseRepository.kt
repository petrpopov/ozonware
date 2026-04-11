package com.ozonware.repository.lookup

import com.ozonware.entity.lookup.Warehouse
import org.springframework.data.jpa.repository.JpaRepository

interface WarehouseRepository : JpaRepository<Warehouse, Long> {
    fun findByOzonWarehouseId(ozonWarehouseId: Long): Warehouse?
}
