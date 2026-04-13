package com.ozonware.controller

import com.ozonware.service.OperationService
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.web.PageableDefault
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/operations")
class OperationController(
    private val operationService: OperationService
) {

    @GetMapping
    fun getAll(
        @RequestParam(required = false) filter: String?,
        @PageableDefault(size = 20, sort = ["operationDate"], direction = Sort.Direction.DESC)
        pageable: Pageable
    ): ResponseEntity<Any> {
        return ResponseEntity.ok(operationService.findAll(filter, pageable))
    }

    @GetMapping("/{id}")
    fun getById(@PathVariable id: Long): ResponseEntity<Map<String, Any?>> {
        return ResponseEntity.ok(operationService.findById(id))
    }

    @PostMapping
    fun create(@RequestBody body: Map<String, Any?>): ResponseEntity<Any> {
        val type = body["type"] as String
        val operationDate = body["operation_date"] as? String
        val note = body["note"] as? String
        @Suppress("UNCHECKED_CAST")
        val items = body["items"] as? List<Map<String, Any?>>
        val totalQuantity = (body["total_quantity"] as? Number)?.toInt()
        @Suppress("UNCHECKED_CAST")
        val differences = body["differences"] as? List<Map<String, Any?>>
        val allowShortage = body["allow_shortage"] as? Boolean
        @Suppress("UNCHECKED_CAST")
        val shortageAdjustments = body["shortage_adjustments"] as? List<Map<String, Any?>>

        val result = operationService.createOperation(
            type, operationDate, note, items, totalQuantity, differences,
            allowShortage, shortageAdjustments
        )

        val correctionId = result["correction_operation_id"]
        return ResponseEntity.status(201).body(
            result.filterKeys { it != "correction_operation_id" } +
                ("correction_operation_id" to (correctionId ?: 0))
        )
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @RequestBody body: Map<String, Any?>): ResponseEntity<Map<String, Any?>> {
        val operationDate = body["operation_date"] as? String
        val note = body["note"] as? String
        @Suppress("UNCHECKED_CAST")
        val items = body["items"] as? List<Map<String, Any?>>
        val totalQuantity = (body["total_quantity"] as? Number)?.toInt()
        @Suppress("UNCHECKED_CAST")
        val differences = body["differences"] as? List<Map<String, Any?>>
        val allowShortage = body["allow_shortage"] as? Boolean
        @Suppress("UNCHECKED_CAST")
        val shortageAdjustments = body["shortage_adjustments"] as? List<Map<String, Any?>>

        return ResponseEntity.ok(
            operationService.updateOperation(
                id, operationDate, note, items, totalQuantity, differences,
                allowShortage, shortageAdjustments
            )
        )
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): ResponseEntity<Map<String, String>> {
        operationService.deleteOperation(id)
        return ResponseEntity.ok(mapOf("message" to "Operation deleted"))
    }

    @PostMapping("/bulk-delete")
    fun bulkDelete(@RequestBody body: Map<String, Any?>): ResponseEntity<Map<String, Any>> {
        @Suppress("UNCHECKED_CAST")
        val ids = (body["ids"] as? List<*>)?.mapNotNull { (it as? Number)?.toLong() } ?: emptyList()
        if (ids.isEmpty()) {
            return ResponseEntity.badRequest().body(mapOf("error" to "ids array is required"))
        }
        return ResponseEntity.ok(operationService.bulkDeleteOperations(ids))
    }
}
