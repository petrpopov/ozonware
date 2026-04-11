package com.ozonware.repository

import com.ozonware.entity.Product
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface ProductRepository : JpaRepository<Product, Long> {

    @Query(value = "SELECT DISTINCT p.* FROM products p " +
        "LEFT JOIN product_field_values pfv ON pfv.product_id = p.id " +
        "WHERE (:search IS NULL OR " +
        "LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "LOWER(p.sku) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "pfv.value_text ILIKE CONCAT('%', :search, '%')) " +
        "ORDER BY p.id DESC",
        nativeQuery = true)
    fun findAllWithSearch(@Param("search") search: String?): List<Product>

    @Query("SELECT CAST(COUNT(DISTINCT i.operationId) AS int) FROM OperationItem i WHERE i.productId = :productId")
    fun countOperationsForProduct(@Param("productId") productId: Long): Int
}
