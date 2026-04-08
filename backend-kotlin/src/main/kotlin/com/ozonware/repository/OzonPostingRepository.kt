package com.ozonware.repository

import com.ozonware.entity.OzonPosting
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.*

@Repository
interface OzonPostingRepository : JpaRepository<OzonPosting, Long> {

    fun findByPostingNumber(postingNumber: String): Optional<OzonPosting>

    @Modifying
    @Query("UPDATE OzonPosting o SET o.shipmentApplied = false, o.shipmentOperationId = NULL WHERE o.shipmentOperationId = :operationId")
    fun clearShipmentFlagsByOperationId(@Param("operationId") operationId: Long): Int
}
