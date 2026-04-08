package com.ozonware.controller

import com.ozonware.service.StatsService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api")
class StatsController(
    private val statsService: StatsService
) {

    @GetMapping("/stats")
    fun getStats(): ResponseEntity<Map<String, Int>> {
        return ResponseEntity.ok(statsService.getStats())
    }

    @GetMapping("/writeoffs")
    fun getWriteoffs(): ResponseEntity<List<Map<String, Any?>>> {
        return ResponseEntity.ok(statsService.getWriteoffs())
    }

    @GetMapping("/writeoffs/summary")
    fun getWriteoffsSummary(): ResponseEntity<List<Map<String, Any>>> {
        return ResponseEntity.ok(statsService.getWriteoffsSummary())
    }
}
