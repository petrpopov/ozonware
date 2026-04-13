package com.ozonware.service

import com.ozonware.exception.ConflictException
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.entity.Product
import com.ozonware.repository.ProductRepository
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** Product catalog service — CRUD for [Product] entities with custom field sync via [ProductFieldsService]. */
@Service
class ProductService(
    private val productRepository: ProductRepository,
    private val productFieldsService: ProductFieldsService
) {

    fun findAll(search: String? = null): List<Product> {
        return productRepository.findAllWithSearch(search)
    }

    fun findAllPaged(search: String?, hideZeroStock: Boolean, pageable: Pageable): Map<String, Any?> {
        var products = productRepository.findAllWithSearch(search)

        val inStockSkus = products.count { it.quantity > 0 }
        val totalUnits = products.sumOf { maxOf(0L, it.quantity.toLong()) }
        val totalAll = products.size

        if (hideZeroStock) {
            products = products.filter { it.quantity > 0 }
        }

        val sorted = applySortToProducts(products, pageable.sort)

        val total = sorted.size
        val offset = pageable.offset.toInt()
        val size = pageable.pageSize
        val items = sorted.drop(offset).take(size)

        return mapOf(
            "items"       to items.map { productToMap(it) },
            "total"       to total,
            "totalAll"    to totalAll,
            "limit"       to size,
            "offset"      to offset,
            "inStockSkus" to inStockSkus,
            "totalUnits"  to totalUnits.toInt()
        )
    }

    private fun applySortToProducts(products: List<Product>, sort: Sort): List<Product> {
        val order = sort.firstOrNull() ?: return products.sortedByDescending { it.id }
        val comparator: Comparator<Product> = when (order.property) {
            "name"     -> compareBy { it.name.lowercase() }
            "sku"      -> compareBy { it.sku.lowercase() }
            "quantity" -> compareBy { it.quantity }
            else       -> compareBy { it.id }
        }
        return if (order.isAscending) products.sortedWith(comparator) else products.sortedWith(comparator.reversed())
    }

    private fun productToMap(product: Product): Map<String, Any?> = mapOf(
        "id"          to product.id,
        "name"        to product.name,
        "sku"         to product.sku,
        "quantity"    to product.quantity,
        "description" to product.description,
        "custom_fields" to productFieldsService.readCustomFields(product.id!!),
        "created_at"  to product.createdAt?.toString(),
        "updated_at"  to product.updatedAt?.toString()
    )

    fun findById(id: Long): Product {
        return productRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Product not found")
        }
    }

    @Transactional
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
                description = description
            )
            val saved = productRepository.save(product)
            productFieldsService.syncFieldValues(saved.id!!, customFields)
            saved
        } catch (e: DataIntegrityViolationException) {
            throw ConflictException("SKU already exists")
        }
    }

    @Transactional
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
            val saved = productRepository.save(product)
            productFieldsService.syncFieldValues(saved.id!!, customFields)
            saved
        } catch (e: DataIntegrityViolationException) {
            throw ConflictException("SKU already exists")
        }
    }

    @Transactional
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
