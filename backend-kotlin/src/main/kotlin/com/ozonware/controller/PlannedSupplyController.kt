package com.ozonware.controller

import com.ozonware.dto.request.PlannedSupplyCreateRequest
import com.ozonware.service.PlannedSupplyService
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.web.PageableDefault
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/planned-supplies")
class PlannedSupplyController(
    private val plannedSupplyService: PlannedSupplyService
) {

    @GetMapping
    fun list(
        @RequestParam(required = false) filter: String?,
        @PageableDefault(size = 20, sort = ["purchaseDate"], direction = Sort.Direction.DESC) pageable: Pageable
    ): ResponseEntity<Map<String, Any?>> =
        ResponseEntity.ok(plannedSupplyService.listSupplies(filter, pageable))

    @GetMapping("/{id}")
    fun getById(@PathVariable id: Long): ResponseEntity<Map<String, Any?>> =
        ResponseEntity.ok(plannedSupplyService.getSupply(id))

    @PostMapping
    fun create(@RequestBody req: PlannedSupplyCreateRequest): ResponseEntity<Map<String, Any?>> {
        val result = plannedSupplyService.createSupply(req)

        return ResponseEntity.status(201).body(result)
    }

    @PutMapping("/{id}")
    fun update(
        @PathVariable id: Long,
        @RequestBody req: PlannedSupplyCreateRequest
    ): ResponseEntity<Map<String, Any?>> =
        ResponseEntity.ok(plannedSupplyService.updateSupply(id, req))

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): ResponseEntity<Map<String, String>> {
        plannedSupplyService.deleteSupply(id)

        return ResponseEntity.ok(mapOf("message" to "Supply deleted"))
    }

    @PatchMapping("/{id}/dates")
    fun updateDates(
        @PathVariable id: Long,
        @RequestBody body: Map<String, String?>
    ): ResponseEntity<Map<String, Any?>> =
        ResponseEntity.ok(plannedSupplyService.updateDates(id, body["purchase_date"], body["expected_date"]))

    @PostMapping("/{id}/close")
    fun close(
        @PathVariable id: Long,
        @RequestBody(required = false) body: Map<String, String?>?
    ): ResponseEntity<Map<String, Any?>> {
        val note = body?.get("note")
        val result = plannedSupplyService.closeSupply(id, note)

        return ResponseEntity.ok(result)
    }
}
