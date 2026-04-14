package com.ozonware.controller

import com.ozonware.domain.enums.DictionaryName
import com.ozonware.dto.request.DictionaryItemRequest
import com.ozonware.service.DictionariesService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** REST controller for reference dictionaries — CRUD for operation types, reasons, warehouses, and other lookup tables. */
@RestController
@RequestMapping("/api/dictionaries")
class DictionariesController(private val dictionariesService: DictionariesService) {

    @GetMapping("/{name}")
    fun list(@PathVariable name: String): ResponseEntity<Any> =
        ResponseEntity.ok(dictionariesService.list(DictionaryName.fromValue(name)))

    @PostMapping("/{name}")
    fun create(@PathVariable name: String, @RequestBody req: DictionaryItemRequest): ResponseEntity<Any> =
        ResponseEntity.status(201).body(dictionariesService.create(DictionaryName.fromValue(name), req))

    @PatchMapping("/{name}/{id}")
    fun update(
        @PathVariable name: String,
        @PathVariable id: Long,
        @RequestBody req: DictionaryItemRequest
    ): ResponseEntity<Any> =
        ResponseEntity.ok(dictionariesService.update(DictionaryName.fromValue(name), id, req))

    @DeleteMapping("/{name}/{id}")
    fun delete(@PathVariable name: String, @PathVariable id: Long): ResponseEntity<Any> {
        dictionariesService.delete(DictionaryName.fromValue(name), id)

        return ResponseEntity.ok(mapOf("message" to "Deleted"))
    }
}
