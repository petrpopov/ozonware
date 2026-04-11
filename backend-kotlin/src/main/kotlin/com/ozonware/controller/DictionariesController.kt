package com.ozonware.controller

import com.ozonware.service.DictionariesService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/dictionaries")
class DictionariesController(private val dictionariesService: DictionariesService) {

    @GetMapping("/{name}")
    fun list(@PathVariable name: String): ResponseEntity<Any> {
        val items = when (name) {
            "operation_types"       -> dictionariesService.getOperationTypes().map { it.toMap() }
            "operation_channels"    -> dictionariesService.getOperationChannels().map { it.toMap() }
            "writeoff_reasons"      -> dictionariesService.getWriteoffReasons().map { it.toMap() }
            "correction_reasons"    -> dictionariesService.getCorrectionReasons().map { it.toMap() }
            "product_field_types"   -> dictionariesService.getProductFieldTypes().map { it.toMap() }
            "ozon_posting_statuses" -> dictionariesService.getOzonPostingStatuses().map { it.toMap() }
            "ozon_supply_states"    -> dictionariesService.getOzonSupplyStates().map { it.toMap() }
            "warehouses"            -> dictionariesService.getWarehouses().map { it.toMap() }
            else -> return ResponseEntity.badRequest().body(mapOf("error" to "Unknown dictionary: $name"))
        }
        return ResponseEntity.ok(items)
    }

    @PostMapping("/{name}")
    fun create(@PathVariable name: String, @RequestBody body: Map<String, Any?>): ResponseEntity<Any> {
        return try {
            val result = when (name) {
                "writeoff_reasons" -> dictionariesService.createWriteoffReason(
                    code = body["code"] as? String ?: return ResponseEntity.badRequest().body(mapOf("error" to "code required")),
                    label = body["label"] as? String ?: return ResponseEntity.badRequest().body(mapOf("error" to "label required")),
                    affectsStock = body["affects_stock"] as? Boolean ?: true
                ).toMap()
                "correction_reasons" -> dictionariesService.createCorrectionReason(
                    code = body["code"] as? String ?: return ResponseEntity.badRequest().body(mapOf("error" to "code required")),
                    label = body["label"] as? String ?: return ResponseEntity.badRequest().body(mapOf("error" to "label required"))
                ).toMap()
                "warehouses" -> dictionariesService.createWarehouse(
                    name = body["name"] as? String ?: return ResponseEntity.badRequest().body(mapOf("error" to "name required")),
                    address = body["address"] as? String
                ).toMap()
                else -> return ResponseEntity.badRequest().body(mapOf("error" to "Dictionary $name is read-only or unknown"))
            }
            ResponseEntity.status(201).body(result)
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().body(mapOf("error" to e.message))
        }
    }

    @PatchMapping("/{name}/{id}")
    fun update(
        @PathVariable name: String,
        @PathVariable id: Long,
        @RequestBody body: Map<String, Any?>
    ): ResponseEntity<Any> {
        return try {
            val result = when (name) {
                "writeoff_reasons" -> dictionariesService.updateWriteoffReason(
                    id = id,
                    label = body["label"] as? String ?: return ResponseEntity.badRequest().body(mapOf("error" to "label required")),
                    affectsStock = body["affects_stock"] as? Boolean ?: true
                ).toMap()
                "correction_reasons" -> dictionariesService.updateCorrectionReason(
                    id = id,
                    label = body["label"] as? String ?: return ResponseEntity.badRequest().body(mapOf("error" to "label required"))
                ).toMap()
                "warehouses" -> dictionariesService.updateWarehouse(
                    id = id,
                    name = body["name"] as? String ?: return ResponseEntity.badRequest().body(mapOf("error" to "name required")),
                    address = body["address"] as? String
                ).toMap()
                else -> return ResponseEntity.badRequest().body(mapOf("error" to "Dictionary $name is read-only or unknown"))
            }
            ResponseEntity.ok(result)
        } catch (e: NoSuchElementException) {
            ResponseEntity.status(404).body(mapOf("error" to e.message))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().body(mapOf("error" to e.message))
        }
    }

    @DeleteMapping("/{name}/{id}")
    fun delete(@PathVariable name: String, @PathVariable id: Long): ResponseEntity<Any> {
        return try {
            when (name) {
                "writeoff_reasons"   -> dictionariesService.deleteWriteoffReason(id)
                "correction_reasons" -> dictionariesService.deleteCorrectionReason(id)
                "warehouses"         -> dictionariesService.deleteWarehouse(id)
                else -> return ResponseEntity.badRequest().body(mapOf("error" to "Dictionary $name is read-only or unknown"))
            }
            ResponseEntity.ok(mapOf("message" to "Deleted"))
        } catch (e: NoSuchElementException) {
            ResponseEntity.status(404).body(mapOf("error" to e.message))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().body(mapOf("error" to e.message))
        }
    }
}
