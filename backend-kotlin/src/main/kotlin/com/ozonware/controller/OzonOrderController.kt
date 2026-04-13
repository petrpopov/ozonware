package com.ozonware.controller

import com.ozonware.service.OzonOrderImportService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** REST controller for OZON order imports — accepts row data, returns import history and per-product stats. */
@RestController
@RequestMapping("/api/ozon/orders")
class OzonOrderController(
    private val ozonOrderImportService: OzonOrderImportService
) {

    @PostMapping("/import")
    fun import(@RequestBody body: Map<String, Any?>): ResponseEntity<Any> {
        return try {
            val result = ozonOrderImportService.importRows(body)
            ResponseEntity.ok(result)
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf("error" to e.message))
        }
    }

    @GetMapping("/imports")
    fun getImports(@RequestParam(required = false, defaultValue = "20") limit: Int): ResponseEntity<Any> {
        return try {
            val result = ozonOrderImportService.getImports(limit)
            ResponseEntity.ok(result)
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf("error" to e.message))
        }
    }

    @GetMapping("/product/{id}/stats")
    fun getProductStats(@PathVariable id: Long): ResponseEntity<Any> {
        return try {
            val result = ozonOrderImportService.getProductStats(id)
            ResponseEntity.ok(result)
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf("error" to e.message))
        }
    }

    @GetMapping("/product/{id}/timeline")
    fun getProductTimeline(
        @PathVariable id: Long,
        @RequestParam(required = false) limit: String?,
        @RequestParam(required = false) offset: String?,
        @RequestParam(required = false) all: String?
    ): ResponseEntity<Any> {
        return try {
            val result = ozonOrderImportService.getProductTimeline(
                id,
                limit = limit,
                offset = offset,
                all = all == "1"
            )
            ResponseEntity.ok(result)
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf("error" to e.message))
        }
    }
}
