package com.ozonware.repository

import com.ozonware.entity.ProductFieldOption
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface ProductFieldOptionRepository : JpaRepository<ProductFieldOption, Long> {
    fun findAllByFieldIdOrderByPositionAsc(fieldId: Long): List<ProductFieldOption>
    fun findByFieldIdAndLabel(fieldId: Long, label: String): ProductFieldOption?
}
