package com.ozonware.repository

import com.ozonware.entity.PlannedSupplyItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

@Repository
interface PlannedSupplyItemRepository : JpaRepository<PlannedSupplyItem, Long> {

    fun findAllByPlannedSupplyId(plannedSupplyId: Long): List<PlannedSupplyItem>

    fun findAllByPlannedSupplyIdIn(ids: Collection<Long>): List<PlannedSupplyItem>

    @Transactional
    fun deleteAllByPlannedSupplyId(plannedSupplyId: Long)
}
