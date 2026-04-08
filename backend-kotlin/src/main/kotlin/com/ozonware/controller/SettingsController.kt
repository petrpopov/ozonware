package com.ozonware.controller

import com.ozonware.service.SettingsService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/settings")
class SettingsController(
    private val settingsService: SettingsService
) {

    @GetMapping("/{key}")
    fun get(@PathVariable key: String): ResponseEntity<Any?> {
        val value = settingsService.getSetting(key)
        return ResponseEntity.ok(value)
    }

    @PostMapping("/{key}")
    fun save(@PathVariable key: String, @RequestBody body: Map<String, Any?>): ResponseEntity<Any?> {
        val value = body["value"]
        val setting = settingsService.saveSetting(key, value!!)
        return ResponseEntity.ok(setting.settingValue)
    }
}
