package com.ozonware.repository

import com.ozonware.entity.ProductFieldValue
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface ProductFieldValueRepository : JpaRepository<ProductFieldValue, Long> {

    fun findAllByProductId(productId: Long): List<ProductFieldValue>

    fun findByProductIdAndFieldId(productId: Long, fieldId: Long): ProductFieldValue?

    @Query(
        value = "SELECT pfv.* FROM product_field_values pfv " +
                "JOIN product_fields pf ON pf.id = pfv.field_id " +
                "WHERE pf.kind = :kind AND pfv.value_text IS NOT NULL",
        nativeQuery = true
    )
    fun findAllByFieldKind(@Param("kind") kind: String): List<ProductFieldValue>

    @Modifying
    @Query(
        value = "INSERT INTO product_field_values (product_id, field_id, value_text) VALUES (:productId, :fieldId, :value) " +
                "ON CONFLICT (product_id, field_id) DO UPDATE SET value_text = EXCLUDED.value_text",
        nativeQuery = true
    )
    fun upsertTextValue(
        @Param("productId") productId: Long,
        @Param("fieldId") fieldId: Long,
        @Param("value") value: String
    )
}
