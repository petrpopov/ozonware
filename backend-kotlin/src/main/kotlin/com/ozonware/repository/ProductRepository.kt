package com.ozonware.repository

import com.ozonware.entity.Product
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface ProductRepository : JpaRepository<Product, Long> {

    @Query("SELECT p FROM Product p WHERE " +
        "(:search IS NULL OR " +
        "LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "LOWER(p.sku) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
        "CAST(p.customFields AS text) ILIKE CONCAT('%', :search, '%')) " +
        "ORDER BY p.id DESC")
    fun findAllWithSearch(@Param("search") search: String?): List<Product>

    @Query("SELECT COUNT(*)::int FROM Operation o WHERE " +
        "EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS item " +
        "WHERE (item ? 'productId') AND (item->>'productId') ~ '^[0-9]+$' " +
        "AND (item->>'productId')::int = :productId) " +
        "OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(o.differences, '[]'::jsonb)) AS diff " +
        "WHERE (diff ? 'productId') AND (diff->>'productId') ~ '^[0-9]+$' " +
        "AND (diff->>'productId')::int = :productId)",
        nativeQuery = true)
    fun countOperationsForProduct(@Param("productId") productId: Long): Int
}
