package com.ozonware.controller

import com.ozonware.exception.BadRequestException
import com.ozonware.service.ProductService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/products")
class ProductController(
    private val productService: ProductService
) {

    @GetMapping
    fun getAll(@RequestParam(required = false) search: String?): ResponseEntity<List<Map<String, Any?>>> {
        val products = productService.findAll(search)
        return ResponseEntity.ok(products.map { productToMap(it) })
    }

    @GetMapping("/{id}")
    fun getById(@PathVariable id: Long): ResponseEntity<Map<String, Any?>> {
        val product = productService.findById(id)
        return ResponseEntity.ok(productToMap(product))
    }

    @GetMapping("/{id}/usage")
    fun getUsage(@PathVariable id: Long): ResponseEntity<Map<String, Any>> {
        val product = productService.findById(id)
        val operationsCount = productService.countOperationsForProduct(product.id!!)
        return ResponseEntity.ok(mapOf(
            "product_id" to product.id!!,
            "operations_count" to operationsCount,
            "can_delete" to (operationsCount == 0)
        ))
    }

    @PostMapping
    fun create(@RequestBody body: Map<String, Any?>): ResponseEntity<Map<String, Any?>> {
        val name = body["name"] as? String ?: throw BadRequestException("Name and SKU are required")
        val sku = body["sku"] as? String ?: throw BadRequestException("Name and SKU are required")
        val quantity = (body["quantity"] as? Number)?.toInt() ?: 0
        val description = body["description"] as? String ?: ""
        val customFields = @Suppress("UNCHECKED_CAST") (body["custom_fields"] as? List<Map<String, Any>>) ?: emptyList()

        val product = productService.createProduct(name, sku, quantity, description, customFields)
        return ResponseEntity.status(201).body(productToMap(product))
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @RequestBody body: Map<String, Any?>): ResponseEntity<Map<String, Any?>> {
        val name = body["name"] as String
        val sku = body["sku"] as String
        val quantity = (body["quantity"] as? Number)?.toInt() ?: 0
        val description = body["description"] as? String ?: ""
        val customFields = @Suppress("UNCHECKED_CAST") (body["custom_fields"] as? List<Map<String, Any>>) ?: emptyList()

        val product = productService.updateProduct(id, name, sku, quantity, description, customFields)
        return ResponseEntity.ok(productToMap(product))
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): ResponseEntity<Map<String, String>> {
        productService.deleteProduct(id)
        return ResponseEntity.ok(mapOf("message" to "Product deleted"))
    }

    private fun productToMap(product: com.ozonware.entity.Product): Map<String, Any?> {
        return mapOf(
            "id" to product.id,
            "name" to product.name,
            "sku" to product.sku,
            "quantity" to product.quantity,
            "description" to product.description,
            "custom_fields" to product.customFields,
            "created_at" to product.createdAt?.toString(),
            "updated_at" to product.updatedAt?.toString()
        )
    }
}
