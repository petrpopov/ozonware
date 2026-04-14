package com.ozonware.repository

import com.ozonware.entity.OperationItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface OperationItemRepository : JpaRepository<OperationItem, Long> {

    fun findAllByOperationId(operationId: Long): List<OperationItem>

    fun findAllByOperationIdIn(operationIds: Collection<Long>): List<OperationItem>

    fun deleteAllByOperationId(operationId: Long)

    @Query("SELECT COUNT(DISTINCT i.operationId) FROM OperationItem i WHERE i.productId = :productId")
    fun countDistinctOperationsByProductId(@Param("productId") productId: Long): Long

    @Query("SELECT i FROM OperationItem i WHERE i.productId = :productId ORDER BY i.operationId DESC")
    fun findAllByProductId(@Param("productId") productId: Long): List<OperationItem>

    @Modifying
    @Query(
        value = "INSERT INTO operation_items " +
                "(operation_id, product_id, requested_qty, applied_qty, delta, " +
                " writeoff_reason_id, writeoff_reason_text, product_name_snapshot, product_sku_snapshot, item_note) " +
                "VALUES (:opId, :productId, :requested, :applied, :delta, " +
                "        :reasonId, :reasonText, :nameSnap, :skuSnap, :note)",
        nativeQuery = true
    )
    fun insertItem(
        @Param("opId") operationId: Long,
        @Param("productId") productId: Long,
        @Param("requested") requestedQty: java.math.BigDecimal,
        @Param("applied") appliedQty: java.math.BigDecimal?,
        @Param("delta") delta: java.math.BigDecimal?,
        @Param("reasonId") writeoffReasonId: Long?,
        @Param("reasonText") writeoffReasonText: String?,
        @Param("nameSnap") productNameSnapshot: String,
        @Param("skuSnap") productSkuSnapshot: String,
        @Param("note") itemNote: String?
    )
}
