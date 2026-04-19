package com.ozonware.controller

import com.ozonware.dto.request.GoogleSheetsConfigRequest
import com.ozonware.exception.BadRequestException
import com.ozonware.service.GoogleSheetsService
import com.ozonware.service.SettingsService
import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** REST controller for Google Sheets integration — config management, connection test, quantity sync. */
@RestController
@RequestMapping("/api")
class GoogleSheetsController(
    private val googleSheetsService: GoogleSheetsService,
    private val settingsService: SettingsService
) {
    companion object {
        private val log = LoggerFactory.getLogger(GoogleSheetsController::class.java)
    }

    @GetMapping("/google-sheets-config")
    fun getConfig(): ResponseEntity<Any> {
        val config = try {
            settingsService.getSetting("google_sheets_config")
        } catch (e: Exception) {
            null
        }

        return if (config != null) {
            ResponseEntity.ok(config)
        } else {
            ResponseEntity.ok(GoogleSheetsConfigRequest())
        }
    }

    @PostMapping("/google-sheets-config")
    fun saveConfig(@RequestBody req: GoogleSheetsConfigRequest): ResponseEntity<Any> {
        log.info("[GoogleSheetsController] saveConfig: spreadsheetId={} sheet={}", req.spreadsheetId, req.sheetName)
        val setting = settingsService.saveSetting("google_sheets_config", req)

        return ResponseEntity.ok(setting.settingValue!!)
    }

    @PostMapping("/google-sheets-test")
    fun testConnection(@RequestBody req: GoogleSheetsConfigRequest): ResponseEntity<Map<String, Any>> {
        if (req.spreadsheetId.isNullOrBlank()) throw BadRequestException("Spreadsheet ID is required")
        if (!googleSheetsService.isInitialized) throw BadRequestException("Google Sheets service not initialized. Check credentials file.")

        return ResponseEntity.ok(googleSheetsService.testConnection(req.spreadsheetId))
    }

    @PostMapping("/google-sheets-sync")
    fun sync(@RequestBody req: GoogleSheetsConfigRequest): ResponseEntity<Map<String, Any>> {
        if (req.spreadsheetId.isNullOrBlank()) throw BadRequestException("Missing required parameter: spreadsheetId")
        if (!googleSheetsService.isInitialized) throw BadRequestException("Google Sheets service not initialized. Check credentials file.")

        log.info("[GoogleSheetsController] sync requested: spreadsheetId={} sheet={}", req.spreadsheetId, req.sheetName)

        val result = googleSheetsService.syncProducts(
            spreadsheetId = req.spreadsheetId,
            sheetName = req.sheetName,
            skuColumn = req.skuColumn,
            quantityColumn = req.quantityColumn,
            startRow = req.startRow,
            categoryColumn = req.categoryColumn,
            colorNameColumn = req.colorNameColumn,
            colorCodeColumn = req.colorCodeColumn,
            swatchColumn = req.swatchColumn,
            hexColumn = req.hexColumn,
            deliveryDateColumn = req.deliveryDateColumn,
            expectedColumn = req.expectedColumn
        )

        return ResponseEntity.ok(result)
    }
}
