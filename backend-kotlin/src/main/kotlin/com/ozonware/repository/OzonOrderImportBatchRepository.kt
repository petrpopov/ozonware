package com.ozonware.repository

import com.ozonware.entity.OzonOrderImportBatch
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface OzonOrderImportBatchRepository : JpaRepository<OzonOrderImportBatch, Long> {

    fun findAllByOrderByImportedAtDescIdDesc(pageable: Pageable): List<OzonOrderImportBatch>
}
