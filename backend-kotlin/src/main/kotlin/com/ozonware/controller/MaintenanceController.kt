package com.ozonware.controller

import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.OperationRepository
import com.ozonware.repository.OzonFboSupplyRepository
import com.ozonware.repository.OzonPostingItemRepository
import com.ozonware.repository.OzonPostingRepository
import com.ozonware.repository.ProductRepository
import com.ozonware.repository.WriteoffRepository
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/maintenance")
class MaintenanceController(
    private val operationRepository: OperationRepository,
    private val writeoffRepository: WriteoffRepository,
    private val ozonPostingItemRepository: OzonPostingItemRepository,
    private val ozonPostingRepository: OzonPostingRepository,
    private val ozonFboSupplyRepository: OzonFboSupplyRepository,
    private val productRepository: ProductRepository
) {

    @Transactional
    @PostMapping("/reset-state")
    fun resetState(): ResponseEntity<Map<String, Any>> {
        val stats = mutableMapOf<String, Int>()

        // Delete operations
        operationRepository.deleteAll()
        stats["operations"] = 0

        // Delete writeoffs
        writeoffRepository.deleteAll()
        stats["writeoffs"] = 0

        // Delete OZON posting items
        ozonPostingItemRepository.deleteAll()
        stats["ozon_posting_items"] = 0

        // Delete OZON postings
        ozonPostingRepository.deleteAll()
        stats["ozon_postings"] = 0

        // Delete FBO supplies (items auto-deleted by CASCADE)
        ozonFboSupplyRepository.deleteAll()
        stats["ozon_fbo_supplies"] = 0

        // Reset product quantities
        val products = productRepository.findAll()
        val resetCount = products.count { it.quantity != 0 }
        for (product in products) {
            if (product.quantity != 0) {
                product.quantity = 0
            }
        }
        productRepository.saveAll(products)
        stats["products_reset"] = resetCount

        return ResponseEntity.ok(mapOf(
            "success" to true,
            "message" to "Состояние успешно очищено",
            "stats" to stats
        ))
    }
}
