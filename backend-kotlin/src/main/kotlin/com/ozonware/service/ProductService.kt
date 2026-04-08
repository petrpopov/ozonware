package com.ozonware.service

import com.ozonware.exception.ConflictException
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.entity.Product
import com.ozonware.repository.ProductRepository
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ProductService(
    private val productRepository: ProductRepository
) {

    fun findAll(search: String? = null): List<Product> {
        return productRepository.findAllWithSearch(search)
    }

    fun findById(id: Long): Product {
        return productRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Product not found")
        }
    }

    fun createProduct(
        name: String,
        sku: String,
        quantity: Int = 0,
        description: String = "",
        customFields: List<Map<String, Any>> = emptyList()
    ): Product {
        return try {
            val product = Product(
                name = name,
                sku = sku,
                quantity = quantity,
                description = description,
                customFields = customFields
            )
            productRepository.save(product)
        } catch (e: DataIntegrityViolationException) {
            throw ConflictException("SKU already exists")
        }
    }

    fun updateProduct(
        id: Long,
        name: String,
        sku: String,
        quantity: Int,
        description: String,
        customFields: List<Map<String, Any>>
    ): Product {
        return try {
            val product = findById(id)
            product.name = name
            product.sku = sku
            product.quantity = quantity
            product.description = description
            product.customFields = customFields
            productRepository.save(product)
        } catch (e: DataIntegrityViolationException) {
            throw ConflictException("SKU already exists")
        }
    }

    fun deleteProduct(id: Long) {
        val operationsCount = productRepository.countOperationsForProduct(id)
        if (operationsCount > 0) {
            throw ConflictException(
                "Товар нельзя удалить: по нему есть операции ($operationsCount)",
                operationsCount
            )
        }
        val product = findById(id)
        productRepository.delete(product)
    }

    fun countOperationsForProduct(id: Long): Int {
        return productRepository.countOperationsForProduct(id)
    }
}
