package com.ozonware.controller

import com.ozonware.service.MaintenanceService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** REST controller for administrative maintenance — resets all transactional state and product quantities to zero. */
@RestController
@RequestMapping("/api/maintenance")
class MaintenanceController(private val maintenanceService: MaintenanceService) {

    @PostMapping("/reset-state")
    fun resetState(): ResponseEntity<Map<String, Any>> =
        ResponseEntity.ok(maintenanceService.resetState())
}
