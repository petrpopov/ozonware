package com.ozonware.repository

import com.ozonware.entity.OzonFboSupplyItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

@Repository
interface OzonFboSupplyItemRepository : JpaRepository<OzonFboSupplyItem, Long> {

    fun findBySupplyId(supplyId: Long): List<OzonFboSupplyItem>

    @Transactional
    @Modifying
    @Query("DELETE FROM OzonFboSupplyItem i WHERE i.supplyId = :supplyId")
    fun deleteBySupplyId(@Param("supplyId") supplyId: Long): Int
}
