package com.ozonware.controller

import com.ozonware.service.OzonService
import com.ozonware.service.SettingsService
import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

/** REST controller for OZON integration — sync triggers, shipment creation, settings management. */
@RestController
@RequestMapping("/api/ozon")
class OzonController(
    private val ozonService: OzonService,
    private val settingsService: SettingsService
) {
    companion object {
        private val log = LoggerFactory.getLogger(OzonController::class.java)
    }

    @GetMapping("/settings")
    fun getSettings(): ResponseEntity<Any?> {
        return try {
            ResponseEntity.ok(settingsService.getSetting("ozon_settings"))
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to fetch OZON settings",
                "message" to e.message
            ))
        }
    }

    @PostMapping("/settings")
    fun saveSettings(@RequestBody settings: Map<String, Any?>): ResponseEntity<Map<String, Any>> {
        log.info("[OzonController] saveSettings: keys={}", settings.keys)
        return try {
            settingsService.saveSetting("ozon_settings", settings)
            ResponseEntity.ok(mapOf("success" to true))
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to save OZON settings",
                "message" to e.message!!
            ))
        }
    }

    @GetMapping("/sync")
    fun sync(): SseEmitter {
        val emitter = SseEmitter(0L)
        ozonService.startFbsSync(emitter)
        return emitter
    }

    @GetMapping("/fbo/sync")
    fun fboSync(): SseEmitter {
        val emitter = SseEmitter(0L)
        ozonService.startFboSync(emitter)
        return emitter
    }

    @PostMapping("/fbs/cancel")
    fun cancelFbs(): ResponseEntity<Map<String, Any>> {
        return try {
            val canceled = ozonService.requestFbsCancel()
            ResponseEntity.ok(mapOf("success" to true, "canceled" to canceled))
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to cancel FBS sync",
                "message" to e.message!!
            ))
        }
    }

    @PostMapping("/fbo/cancel")
    fun cancelFbo(): ResponseEntity<Map<String, Any>> {
        return try {
            val canceled = ozonService.requestFboCancel()
            ResponseEntity.ok(mapOf("success" to true, "canceled" to canceled))
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to cancel FBO sync",
                "message" to e.message!!
            ))
        }
    }

    @GetMapping("/shipments")
    fun getShipments(): ResponseEntity<Any> {
        return try {
            ResponseEntity.ok(ozonService.loadDailyStats())
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to fetch daily stats",
                "message" to e.message!!
            ))
        }
    }

    @GetMapping("/fbo/supplies")
    fun getFboSupplies(): ResponseEntity<Any> {
        return try {
            ResponseEntity.ok(ozonService.loadFboDailyStats())
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to fetch FBO daily stats",
                "message" to e.message!!
            ))
        }
    }

    @PostMapping("/shipments")
    fun createShipments(@RequestBody body: Map<String, Any?>?): ResponseEntity<Map<String, Any?>> {
        return try {
            val days = body?.get("days") as? List<String>
            val result = ozonService.createShipments(days)
            ResponseEntity.ok(result)
        } catch (e: Exception) {
            log.error("Failed to create FBS shipment", e)
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to create shipment",
                "message" to e.message!!
            ))
        }
    }

    @PostMapping("/fbo/shipments")
    fun createFboShipments(@RequestBody body: Map<String, Any?>?): ResponseEntity<Map<String, Any?>> {
        return try {
            val days = body?.get("days") as? List<String>
            ResponseEntity.ok(ozonService.createShipmentsFromFbo(days))
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to create FBO shipments",
                "message" to e.message!!
            ))
        }
    }

    @PostMapping("/products/sync")
    fun syncProducts(): ResponseEntity<Map<String, Any>> {
        return try {
            val result = ozonService.syncProductImagesFromOzon()
            ResponseEntity.ok(result)
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to sync OZON products",
                "message" to e.message!!
            ))
        }
    }

    @PostMapping("/fbs/shipments-from-csv")
    fun createFbsShipmentsFromCsv(@RequestBody body: Map<String, Any?>?): ResponseEntity<Map<String, Any?>> {
        return try {
            @Suppress("UNCHECKED_CAST")
            val daysData = body?.get("days") as? List<Map<String, Any?>> ?: emptyList()
            ResponseEntity.ok(ozonService.createShipmentsFromFbsCsv(daysData))
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to create FBS shipments from CSV",
                "message" to e.message!!
            ))
        }
    }

    @PostMapping("/fbs/csv-analyze")
    fun analyzeFbsCsv(@RequestBody body: Map<String, Any?>?): ResponseEntity<Map<String, Any?>> {
        return try {
            @Suppress("UNCHECKED_CAST")
            val daysData = body?.get("days") as? List<Map<String, Any?>> ?: emptyList()
            ResponseEntity.ok(ozonService.analyzeFbsCsvDays(daysData))
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to analyze FBS CSV",
                "message" to e.message!!
            ))
        }
    }
}
