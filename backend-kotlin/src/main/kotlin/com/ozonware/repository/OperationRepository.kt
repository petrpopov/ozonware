package com.ozonware.repository

import com.ozonware.entity.Operation
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface OperationRepository : JpaRepository<Operation, Long> {

    @Query("SELECT o FROM Operation o ORDER BY o.createdAt DESC")
    fun findAllWithPaging(pageable: Pageable): Page<Operation>

    @Query("SELECT COUNT(o) FROM Operation o")
    fun countAll(): Long

    @Query("SELECT COUNT(o) FROM Operation o WHERE o.type = :type")
    fun countByType(@Param("type") type: String): Long

    @Query("SELECT o FROM Operation o WHERE o.type = :type ORDER BY o.createdAt DESC")
    fun findByType(@Param("type") type: String, pageable: Pageable): Page<Operation>
}
