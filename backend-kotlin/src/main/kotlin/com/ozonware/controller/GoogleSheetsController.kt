package com.ozonware.controller

import com.ozonware.service.GoogleSheetsService
import com.ozonware.service.SettingsService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api")
class GoogleSheetsController(
    private val googleSheetsService: GoogleSheetsService,
    private val settingsService: SettingsService
) {

    @GetMapping("/google-sheets-config")
    fun getConfig(): ResponseEntity<Map<String, Any>> {
        val config = try {
            settingsService.getSetting("google_sheets_config")
        } catch (e: Exception) {
            null
        }

        return if (config != null) {
            @Suppress("UNCHECKED_CAST")
            ResponseEntity.ok(config as Map<String, Any>)
        } else {
            ResponseEntity.ok(mapOf(
                "spreadsheetId" to "",
                "sheetName" to "Лист1",
                "skuColumn" to "A",
                "quantityColumn" to "B",
                "startRow" to 2
            ))
        }
    }

    @PostMapping("/google-sheets-config")
    fun saveConfig(@RequestBody body: Map<String, Any>): ResponseEntity<Any> {
        val setting = settingsService.saveSetting("google_sheets_config", body)
        return ResponseEntity.ok(setting.settingValue!!)
    }

    @PostMapping("/google-sheets-test")
    fun testConnection(@RequestBody body: Map<String, Any>): ResponseEntity<Map<String, Any>> {
        val spreadsheetId = body["spreadsheetId"] as? String
        if (spreadsheetId.isNullOrBlank()) {
            return ResponseEntity.badRequest().body(mapOf(
                "success" to false,
                "error" to "Spreadsheet ID is required"
            ))
        }
        return ResponseEntity.ok(mapOf("success" to true, "message" to "Connection test placeholder"))
    }

    @PostMapping("/google-sheets-sync")
    fun sync(@RequestBody body: Map<String, Any?>): ResponseEntity<Map<String, Any>> {
        val spreadsheetId = body["spreadsheetId"] as? String
        if (spreadsheetId.isNullOrBlank()) {
            return ResponseEntity.badRequest().body(mapOf(
                "success" to false,
                "error" to "Missing required parameter: spreadsheetId"
            ))
        }

        val result = googleSheetsService.syncProducts(
            spreadsheetId = spreadsheetId,
            sheetName = (body["sheetName"] as? String) ?: "Лист1",
            skuColumn = (body["skuColumn"] as? String) ?: "A",
            quantityColumn = (body["quantityColumn"] as? String) ?: "B",
            startRow = (body["startRow"] as? Number)?.toInt() ?: 2
        )

        return ResponseEntity.ok(result)
    }
}
