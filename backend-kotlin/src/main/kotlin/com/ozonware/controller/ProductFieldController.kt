package com.ozonware.controller

import com.ozonware.dto.request.ProductFieldCreateRequest
import com.ozonware.dto.request.ProductFieldUpdateRequest
import com.ozonware.service.ProductFieldService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** REST controller for product field schema — CRUD for user-defined custom fields on products. */
@RestController
@RequestMapping("/api/product-fields")
class ProductFieldController(private val productFieldService: ProductFieldService) {

    @GetMapping
    fun getAll(): ResponseEntity<List<Map<String, Any?>>> =
        ResponseEntity.ok(productFieldService.findAll().map { productFieldService.toResponse(it) })

    @PostMapping
    fun create(@RequestBody req: ProductFieldCreateRequest): ResponseEntity<Map<String, Any?>> {
        val field = productFieldService.createField(req.name, req.type, req.required, req.showInTable, req.options, req.position)

        return ResponseEntity.status(201).body(productFieldService.toResponse(field))
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @RequestBody req: ProductFieldUpdateRequest): ResponseEntity<Map<String, Any?>> {
        val field = productFieldService.updateField(id, req.name, req.type, req.required, req.showInTable, req.options, req.position)

        return ResponseEntity.ok(productFieldService.toResponse(field))
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): ResponseEntity<Map<String, String>> {
        productFieldService.deleteField(id)

        return ResponseEntity.ok(mapOf("message" to "Product field deleted"))
    }
}
