package com.ozonware.repository.lookup

import com.ozonware.entity.lookup.CorrectionReason
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface CorrectionReasonRepository : JpaRepository<CorrectionReason, Long> {
    fun findAllByOrderByPositionAsc(): List<CorrectionReason>
    fun findByCode(code: String): CorrectionReason?

    @Query("SELECT COALESCE(MAX(r.position), 0) FROM CorrectionReason r")
    fun findMaxPosition(): Int
}
