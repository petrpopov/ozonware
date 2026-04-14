package com.ozonware.controller

import com.ozonware.dto.request.OperationBulkDeleteRequest
import com.ozonware.dto.request.OperationCreateRequest
import com.ozonware.dto.request.OperationUpdateRequest
import com.ozonware.exception.BadRequestException
import com.ozonware.service.OperationService
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.web.PageableDefault
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** REST controller for warehouse operations — paginated list, create, update, delete for receipts/shipments/writeoffs. */
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
    ): ResponseEntity<Any> =
        ResponseEntity.ok(operationService.findAll(filter, pageable))

    @GetMapping("/{id}")
    fun getById(@PathVariable id: Long): ResponseEntity<Map<String, Any?>> =
        ResponseEntity.ok(operationService.findById(id))

    @PostMapping
    fun create(@RequestBody req: OperationCreateRequest): ResponseEntity<Any> {
        val result = operationService.createOperation(
            req.type, req.operationDate, req.note, req.items, req.totalQuantity,
            req.differences, req.allowShortage, req.shortageAdjustments
        )
        val correctionId = result["correction_operation_id"]

        return ResponseEntity.status(201).body(
            result.filterKeys { it != "correction_operation_id" } +
                ("correction_operation_id" to (correctionId ?: 0))
        )
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @RequestBody req: OperationUpdateRequest): ResponseEntity<Map<String, Any?>> =
        ResponseEntity.ok(
            operationService.updateOperation(
                id, req.operationDate, req.note, req.items, req.totalQuantity,
                req.differences, req.allowShortage, req.shortageAdjustments
            )
        )

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): ResponseEntity<Map<String, String>> {
        operationService.deleteOperation(id)

        return ResponseEntity.ok(mapOf("message" to "Operation deleted"))
    }

    @PostMapping("/bulk-delete")
    fun bulkDelete(@RequestBody req: OperationBulkDeleteRequest): ResponseEntity<Map<String, Any>> {
        if (req.ids.isEmpty()) throw BadRequestException("ids array is required")

        return ResponseEntity.ok(operationService.bulkDeleteOperations(req.ids))
    }
}
