package com.ozonware.repository

import com.ozonware.entity.OzonPostingItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

@Repository
interface OzonPostingItemRepository : JpaRepository<OzonPostingItem, Long> {

    fun findByPostingId(postingId: Long): List<OzonPostingItem>

    @Transactional
    @Modifying
    @Query("DELETE FROM OzonPostingItem i WHERE i.postingId = :postingId")
    fun deleteByPostingId(@Param("postingId") postingId: Long): Int
}
