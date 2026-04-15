package com.ozonware.repository

import com.ozonware.entity.PlannedSupply
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.stereotype.Repository

@Repository
interface PlannedSupplyRepository : JpaRepository<PlannedSupply, Long>, JpaSpecificationExecutor<PlannedSupply> {

    fun findAllByStatusNot(status: String, pageable: Pageable): Page<PlannedSupply>

    fun findAllByStatus(status: String, pageable: Pageable): Page<PlannedSupply>

    fun existsByIdAndStatusNot(id: Long, status: String): Boolean
}
