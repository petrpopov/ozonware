package com.ozonware.service

import com.ozonware.entity.ProductField
import com.ozonware.exception.BadRequestException
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.ProductFieldRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** Schema-level CRUD for user-defined product fields — manages [ProductField] definitions (not their values). */
@Service
class ProductFieldService(
    private val productFieldRepository: ProductFieldRepository
) {

    fun findAll(): List<ProductField> {
        return productFieldRepository.findAllByOrderByPositionAsc()
    }

    fun createField(
        name: String,
        type: String,
        required: Boolean = false,
        showInTable: Boolean = true,
        options: List<String> = emptyList(),
        position: Int = 0
    ): ProductField {
        val field = ProductField(
            name = name,
            type = type,
            required = required,
            showInTable = showInTable,
            options = options,
            position = position
        )
        return productFieldRepository.save(field)
    }

    fun updateField(
        id: Long,
        name: String,
        type: String,
        required: Boolean,
        showInTable: Boolean,
        options: List<String>,
        position: Int
    ): ProductField {
        val field = productFieldRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Product field not found")
        }
        if (field.isSystem) throw BadRequestException("Cannot modify system field")
        field.name = name
        field.type = type
        field.required = required
        field.showInTable = showInTable
        field.options = options
        field.position = position
        return productFieldRepository.save(field)
    }

    fun toResponse(field: ProductField): Map<String, Any?> = mapOf(
        "id" to field.id,
        "name" to field.name,
        "type" to field.type,
        "kind" to field.kind,
        "is_system" to field.isSystem,
        "required" to field.required,
        "show_in_table" to field.showInTable,
        "options" to field.options,
        "position" to field.position,
        "created_at" to field.createdAt?.toString(),
        "updated_at" to field.updatedAt?.toString()
    )

    fun deleteField(id: Long): ProductField {
        val field = productFieldRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Product field not found")
        }
        if (field.isSystem) throw BadRequestException("Cannot delete system field")
        productFieldRepository.delete(field)
        return field
    }
}
