package com.ozonware.service

import com.ozonware.entity.ProductField
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.ProductFieldRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

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
        field.name = name
        field.type = type
        field.required = required
        field.showInTable = showInTable
        field.options = options
        field.position = position
        return productFieldRepository.save(field)
    }

    fun deleteField(id: Long): ProductField {
        val field = productFieldRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Product field not found")
        }
        productFieldRepository.delete(field)
        return field
    }
}
