package com.ozonware.repository

import com.ozonware.entity.OperationInventoryDiff
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface OperationInventoryDiffRepository : JpaRepository<OperationInventoryDiff, Long> {

    fun findAllByOperationId(operationId: Long): List<OperationInventoryDiff>

    fun deleteAllByOperationId(operationId: Long)
}
