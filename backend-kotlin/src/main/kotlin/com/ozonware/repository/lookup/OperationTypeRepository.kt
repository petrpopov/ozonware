package com.ozonware.repository.lookup

import com.ozonware.entity.lookup.OperationType
import org.springframework.data.jpa.repository.JpaRepository

interface OperationTypeRepository : JpaRepository<OperationType, String> {
    fun findAllByOrderByPositionAsc(): List<OperationType>
}
