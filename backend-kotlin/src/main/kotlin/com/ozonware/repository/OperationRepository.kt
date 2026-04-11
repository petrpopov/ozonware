package com.ozonware.repository

import com.ozonware.entity.Operation
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.time.LocalDate

@Repository
interface OperationRepository : JpaRepository<Operation, Long> {

    @Query("SELECT o FROM Operation o ORDER BY o.createdAt DESC")
    fun findAllWithPaging(pageable: Pageable): Page<Operation>

    @Query("SELECT COUNT(o) FROM Operation o")
    fun countAll(): Long

    @Query("SELECT COUNT(o) FROM Operation o WHERE o.typeCode = :typeCode")
    fun countByType(@Param("typeCode") typeCode: String): Long

    @Query("SELECT o FROM Operation o WHERE o.typeCode = :typeCode ORDER BY o.createdAt DESC")
    fun findByType(@Param("typeCode") typeCode: String, pageable: Pageable): Page<Operation>

    fun findByParentOperationId(parentOperationId: Long): List<Operation>

    @Query("SELECT o FROM Operation o WHERE o.typeCode = :typeCode AND o.channelCode = :channelCode AND o.operationDate = :date ORDER BY o.id DESC")
    fun findByTypeCodeAndChannelCodeAndOperationDate(
        @Param("typeCode") typeCode: String,
        @Param("channelCode") channelCode: String,
        @Param("date") date: LocalDate
    ): List<Operation>
}
