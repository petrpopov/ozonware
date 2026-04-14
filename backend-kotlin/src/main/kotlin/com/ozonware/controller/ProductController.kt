package com.ozonware.controller

import com.ozonware.dto.request.ProductCreateRequest
import com.ozonware.dto.request.ProductUpdateRequest
import com.ozonware.exception.BadRequestException
import com.ozonware.service.ProductService
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.web.PageableDefault
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** REST controller for product catalog — paginated list with search, CRUD with custom field support. */
@RestController
@RequestMapping("/api/products")
class ProductController(private val productService: ProductService) {

    @GetMapping
    fun getAll(
        @RequestParam(required = false) search: String?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false, defaultValue = "false") hideZeroStock: Boolean,
        @PageableDefault(size = 20, sort = ["id"], direction = Sort.Direction.DESC)
        pageable: Pageable
    ): ResponseEntity<Any> {
        if (page == null) {
            return ResponseEntity.ok(productService.findAll(search).map { productService.toResponse(it) })
        }

        return ResponseEntity.ok(productService.findAllPaged(search, hideZeroStock, pageable))
    }

    @GetMapping("/{id}")
    fun getById(@PathVariable id: Long): ResponseEntity<Map<String, Any?>> =
        ResponseEntity.ok(productService.toResponse(productService.findById(id)))

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
    fun create(@RequestBody req: ProductCreateRequest): ResponseEntity<Map<String, Any?>> {
        if (req.name.isBlank() || req.sku.isBlank()) throw BadRequestException("Name and SKU are required")
        val product = productService.createProduct(req.name, req.sku, req.quantity, req.description, req.customFields)

        return ResponseEntity.status(201).body(productService.toResponse(product))
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @RequestBody req: ProductUpdateRequest): ResponseEntity<Map<String, Any?>> {
        val product = productService.updateProduct(id, req.name, req.sku, req.quantity, req.description, req.customFields)

        return ResponseEntity.ok(productService.toResponse(product))
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): ResponseEntity<Map<String, String>> {
        productService.deleteProduct(id)

        return ResponseEntity.ok(mapOf("message" to "Product deleted"))
    }
}
