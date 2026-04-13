package com.ozonware.repository

import com.ozonware.entity.OperationInventoryDiff
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface OperationInventoryDiffRepository : JpaRepository<OperationInventoryDiff, Long> {

    fun findAllByOperationId(operationId: Long): List<OperationInventoryDiff>

    fun deleteAllByOperationId(operationId: Long)

    @Query("SELECT d FROM OperationInventoryDiff d WHERE d.productId = :productId ORDER BY d.operationId DESC")
    fun findAllByProductId(@Param("productId") productId: Long): List<OperationInventoryDiff>
}
