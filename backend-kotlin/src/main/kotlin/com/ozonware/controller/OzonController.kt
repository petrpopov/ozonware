package com.ozonware.controller

import com.ozonware.dto.request.OzonCsvShipmentsRequest
import com.ozonware.dto.request.OzonShipmentDaysRequest
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
    fun getShipments(): ResponseEntity<Any> =
        ResponseEntity.ok(ozonService.loadDailyStats())

    @GetMapping("/fbo/supplies")
    fun getFboSupplies(): ResponseEntity<Any> =
        ResponseEntity.ok(ozonService.loadFboDailyStats())

    @PostMapping("/shipments")
    fun createShipments(@RequestBody req: OzonShipmentDaysRequest): ResponseEntity<Map<String, Any?>> {
        return try {
            ResponseEntity.ok(ozonService.createShipments(req.days))
        } catch (e: Exception) {
            log.error("Failed to create FBS shipment", e)
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to create shipment",
                "message" to e.message!!
            ))
        }
    }

    @PostMapping("/fbo/shipments")
    fun createFboShipments(@RequestBody req: OzonShipmentDaysRequest): ResponseEntity<Map<String, Any?>> {
        return try {
            ResponseEntity.ok(ozonService.createShipmentsFromFbo(req.days))
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to create FBO shipments",
                "message" to e.message!!
            ))
        }
    }

    @PostMapping("/products/sync")
    fun syncProducts(): ResponseEntity<Map<String, Any>> =
        ResponseEntity.ok(ozonService.syncProductImagesFromOzon())

    @PostMapping("/fbs/shipments-from-csv")
    fun createFbsShipmentsFromCsv(@RequestBody req: OzonCsvShipmentsRequest): ResponseEntity<Map<String, Any?>> {
        return try {
            ResponseEntity.ok(ozonService.createShipmentsFromFbsCsv(req.days))
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to create FBS shipments from CSV",
                "message" to e.message!!
            ))
        }
    }

    @PostMapping("/fbs/csv-analyze")
    fun analyzeFbsCsv(@RequestBody req: OzonCsvShipmentsRequest): ResponseEntity<Map<String, Any?>> {
        return try {
            ResponseEntity.ok(ozonService.analyzeFbsCsvDays(req.days))
        } catch (e: Exception) {
            ResponseEntity.status(500).body(mapOf(
                "error" to "Failed to analyze FBS CSV",
                "message" to e.message!!
            ))
        }
    }
}
