package com.ozonware.repository

import com.ozonware.entity.Writeoff
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface WriteoffRepository : JpaRepository<Writeoff, Long> {

    @Query("SELECT w FROM Writeoff w JOIN FETCH w.product ORDER BY w.createdAt DESC")
    fun findAllWithProduct(): List<Writeoff>

    @Query("""
        SELECT w.product.id as productId, w.product.name as productName, w.product.sku as productSku,
               w.reason, SUM(w.quantity) as totalQuantity, COUNT(w) as operationsCount
        FROM Writeoff w JOIN w.product
        GROUP BY w.product.id, w.product.name, w.product.sku, w.reason
        HAVING SUM(w.quantity) > 0
        ORDER BY w.product.sku, w.reason
    """)
    fun findSummary(): List<Map<String, Any>>
}
