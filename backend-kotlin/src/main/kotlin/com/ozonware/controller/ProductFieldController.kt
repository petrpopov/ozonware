package com.ozonware.controller

import com.ozonware.service.ProductFieldService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/product-fields")
class ProductFieldController(
    private val productFieldService: ProductFieldService
) {

    @GetMapping
    fun getAll(): ResponseEntity<List<Map<String, Any?>>> {
        val fields = productFieldService.findAll()
        return ResponseEntity.ok(fields.map { fieldToMap(it) })
    }

    @PostMapping
    fun create(@RequestBody body: Map<String, Any?>): ResponseEntity<Map<String, Any?>> {
        val name = body["name"] as String
        val type = body["type"] as String
        val required = body["required"] as? Boolean ?: false
        val showInTable = body["show_in_table"] as? Boolean ?: true
        @Suppress("UNCHECKED_CAST")
        val options = (body["options"] as? List<String>) ?: emptyList()
        val position = (body["position"] as? Number)?.toInt() ?: 0

        val field = productFieldService.createField(name, type, required, showInTable, options, position)
        return ResponseEntity.status(201).body(fieldToMap(field))
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @RequestBody body: Map<String, Any?>): ResponseEntity<Map<String, Any?>> {
        val name = body["name"] as String
        val type = body["type"] as String
        val required = body["required"] as Boolean
        val showInTable = body["show_in_table"] as Boolean
        @Suppress("UNCHECKED_CAST")
        val options = (body["options"] as? List<String>) ?: emptyList()
        val position = (body["position"] as? Number)?.toInt() ?: 0

        val field = productFieldService.updateField(id, name, type, required, showInTable, options, position)
        return ResponseEntity.ok(fieldToMap(field))
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): ResponseEntity<Map<String, String>> {
        productFieldService.deleteField(id)
        return ResponseEntity.ok(mapOf("message" to "Product field deleted"))
    }

    private fun fieldToMap(field: com.ozonware.entity.ProductField): Map<String, Any?> {
        return mapOf(
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
    }
}
