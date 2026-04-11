package com.ozonware.repository.lookup

import com.ozonware.entity.lookup.WriteoffReason
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface WriteoffReasonRepository : JpaRepository<WriteoffReason, Long> {
    fun findAllByOrderByPositionAsc(): List<WriteoffReason>
    fun findByCode(code: String): WriteoffReason?

    @Query("SELECT COALESCE(MAX(r.position), 0) FROM WriteoffReason r")
    fun findMaxPosition(): Int
}
