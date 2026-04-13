package com.ozonware.controller

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

/** Health-check endpoint — returns application liveness status and current timestamp. */
@RestController
@RequestMapping("/api/health")
class HealthController {

    @GetMapping
    fun health(): ResponseEntity<Map<String, String>> {
        return ResponseEntity.ok(mapOf(
            "status" to "ok",
            "timestamp" to Instant.now().toString()
        ))
    }
}
