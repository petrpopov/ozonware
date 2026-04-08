package com.ozonware.repository

import com.ozonware.entity.OzonOrderLine
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface OzonOrderLineRepository : JpaRepository<OzonOrderLine, Long> {

    fun findByExternalLineKey(externalLineKey: String): OzonOrderLine?

    fun findByProductId(productId: Long): List<OzonOrderLine>

    @Query("SELECT o FROM OzonOrderLine o WHERE o.productId = :productId")
    fun findAllByProductId(@Param("productId") productId: Long): List<OzonOrderLine>
}
