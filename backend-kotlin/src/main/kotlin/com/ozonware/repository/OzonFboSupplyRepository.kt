package com.ozonware.repository

import com.ozonware.entity.OzonFboSupply
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.*

@Repository
interface OzonFboSupplyRepository : JpaRepository<OzonFboSupply, Long> {

    fun findByBundleId(bundleId: String): Optional<OzonFboSupply>

    @Modifying
    @Query("UPDATE OzonFboSupply s SET s.shipmentApplied = false, s.shipmentOperationId = NULL WHERE s.shipmentOperationId = :operationId")
    fun clearShipmentFlagsByOperationId(@Param("operationId") operationId: Long): Int
}
