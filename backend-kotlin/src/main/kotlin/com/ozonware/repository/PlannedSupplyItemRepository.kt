package com.ozonware.repository

import com.ozonware.entity.PlannedSupplyItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface PlannedSupplyItemRepository : JpaRepository<PlannedSupplyItem, Long> {

    fun findAllByPlannedSupplyId(plannedSupplyId: Long): List<PlannedSupplyItem>

    fun deleteAllByPlannedSupplyId(plannedSupplyId: Long)
}
