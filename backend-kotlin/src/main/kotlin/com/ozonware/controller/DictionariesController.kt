package com.ozonware.controller

import com.ozonware.domain.enums.DictionaryName
import com.ozonware.dto.request.DictionaryItemRequest
import com.ozonware.exception.BadRequestException
import com.ozonware.service.DictionariesService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** REST controller for reference dictionaries — CRUD for operation types, reasons, warehouses, and other lookup tables. */
@RestController
@RequestMapping("/api/dictionaries")
class DictionariesController(private val dictionariesService: DictionariesService) {

    @GetMapping("/{name}")
    fun list(@PathVariable name: String): ResponseEntity<Any> {
        val dict = DictionaryName.fromValue(name)
        val items = when (dict) {
            DictionaryName.OPERATION_TYPES       -> dictionariesService.getOperationTypes().map { it.toMap() }
            DictionaryName.OPERATION_CHANNELS    -> dictionariesService.getOperationChannels().map { it.toMap() }
            DictionaryName.WRITEOFF_REASONS      -> dictionariesService.getWriteoffReasons().map { it.toMap() }
            DictionaryName.CORRECTION_REASONS    -> dictionariesService.getCorrectionReasons().map { it.toMap() }
            DictionaryName.PRODUCT_FIELD_TYPES   -> dictionariesService.getProductFieldTypes().map { it.toMap() }
            DictionaryName.OZON_POSTING_STATUSES -> dictionariesService.getOzonPostingStatuses().map { it.toMap() }
            DictionaryName.OZON_SUPPLY_STATES    -> dictionariesService.getOzonSupplyStates().map { it.toMap() }
            DictionaryName.WAREHOUSES            -> dictionariesService.getWarehouses().map { it.toMap() }
        }

        return ResponseEntity.ok(items)
    }

    @PostMapping("/{name}")
    fun create(@PathVariable name: String, @RequestBody req: DictionaryItemRequest): ResponseEntity<Any> {
        val dict = DictionaryName.fromValue(name)
        val result = when (dict) {
            DictionaryName.WRITEOFF_REASONS -> dictionariesService.createWriteoffReason(
                code = req.code ?: throw BadRequestException("code required"),
                label = req.label ?: throw BadRequestException("label required"),
                affectsStock = req.affectsStock
            ).toMap()
            DictionaryName.CORRECTION_REASONS -> dictionariesService.createCorrectionReason(
                code = req.code ?: throw BadRequestException("code required"),
                label = req.label ?: throw BadRequestException("label required")
            ).toMap()
            DictionaryName.WAREHOUSES -> dictionariesService.createWarehouse(
                name = req.name ?: throw BadRequestException("name required"),
                address = req.address
            ).toMap()
            else -> throw BadRequestException("Dictionary ${dict.value} is read-only")
        }

        return ResponseEntity.status(201).body(result)
    }

    @PatchMapping("/{name}/{id}")
    fun update(
        @PathVariable name: String,
        @PathVariable id: Long,
        @RequestBody req: DictionaryItemRequest
    ): ResponseEntity<Any> {
        val dict = DictionaryName.fromValue(name)
        val result = when (dict) {
            DictionaryName.WRITEOFF_REASONS -> dictionariesService.updateWriteoffReason(
                id = id,
                label = req.label ?: throw BadRequestException("label required"),
                affectsStock = req.affectsStock
            ).toMap()
            DictionaryName.CORRECTION_REASONS -> dictionariesService.updateCorrectionReason(
                id = id,
                label = req.label ?: throw BadRequestException("label required")
            ).toMap()
            DictionaryName.WAREHOUSES -> dictionariesService.updateWarehouse(
                id = id,
                name = req.name ?: throw BadRequestException("name required"),
                address = req.address
            ).toMap()
            else -> throw BadRequestException("Dictionary ${dict.value} is read-only")
        }

        return ResponseEntity.ok(result)
    }

    @DeleteMapping("/{name}/{id}")
    fun delete(@PathVariable name: String, @PathVariable id: Long): ResponseEntity<Any> {
        val dict = DictionaryName.fromValue(name)
        when (dict) {
            DictionaryName.WRITEOFF_REASONS   -> dictionariesService.deleteWriteoffReason(id)
            DictionaryName.CORRECTION_REASONS -> dictionariesService.deleteCorrectionReason(id)
            DictionaryName.WAREHOUSES         -> dictionariesService.deleteWarehouse(id)
            else -> throw BadRequestException("Dictionary ${dict.value} is read-only")
        }

        return ResponseEntity.ok(mapOf("message" to "Deleted"))
    }
}
