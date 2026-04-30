package com.ozonware.repository

import com.ozonware.entity.Product
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.Optional

@Repository
interface ProductRepository : JpaRepository<Product, Long> {

    fun findBySku(sku: String): Optional<Product>

    @Query(value = "SELECT DISTINCT p.* FROM products p " +
        "LEFT JOIN product_field_values pfv ON pfv.product_id = p.id " +
        "WHERE (:includeInactive = TRUE OR p.is_active = TRUE) AND " +
        "(:search IS NULL OR " +
        "LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "LOWER(p.sku) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "pfv.value_text ILIKE CONCAT('%', :search, '%')) " +
        "ORDER BY p.id DESC",
        nativeQuery = true)
    fun findAllWithSearch(
        @Param("search") search: String?,
        @Param("includeInactive") includeInactive: Boolean = false
    ): List<Product>

    @Modifying
    @Query("UPDATE Product p SET p.isActive = true WHERE p.id IN :ids AND p.isActive = false")
    fun activateAll(@Param("ids") ids: Collection<Long>): Int

    @Query("SELECT CAST(COUNT(DISTINCT i.operationId) AS int) FROM OperationItem i WHERE i.productId = :productId")
    fun countOperationsForProduct(@Param("productId") productId: Long): Int
}
