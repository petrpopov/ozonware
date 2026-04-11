package com.ozonware.repository

import com.ozonware.entity.ProductField
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface ProductFieldRepository : JpaRepository<ProductField, Long> {
    fun findByName(name: String): ProductField?
    fun findByKind(kind: String): ProductField?
    fun findAllByOrderByPositionAsc(): List<ProductField>
}
