package com.ozonware.controller

import com.ozonware.repository.OperationRepository
import com.ozonware.repository.OzonFboSupplyRepository
import com.ozonware.repository.OzonOrderImportBatchRepository
import com.ozonware.repository.OzonOrderLineRepository
import com.ozonware.repository.OzonPostingItemRepository
import com.ozonware.repository.OzonPostingRepository
import com.ozonware.repository.ProductRepository
import com.ozonware.repository.WriteoffRepository
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** REST controller for administrative maintenance — resets all transactional state and product quantities to zero. */
@RestController
@RequestMapping("/api/maintenance")
class MaintenanceController(
    private val operationRepository: OperationRepository,
    private val writeoffRepository: WriteoffRepository,
    private val ozonPostingItemRepository: OzonPostingItemRepository,
    private val ozonPostingRepository: OzonPostingRepository,
    private val ozonFboSupplyRepository: OzonFboSupplyRepository,
    private val ozonOrderLineRepository: OzonOrderLineRepository,
    private val ozonOrderImportBatchRepository: OzonOrderImportBatchRepository,
    private val productRepository: ProductRepository
) {

    @Transactional
    @PostMapping("/reset-state")
    fun resetState(): ResponseEntity<Map<String, Any>> {
        val stats = mutableMapOf<String, Int>()

        // Delete writeoffs (before operations due to FK)
        val writeoffsCount = writeoffRepository.count().toInt()
        writeoffRepository.deleteAll()
        stats["writeoffs"] = writeoffsCount

        // Delete operations (cascades: operation_items, operation_inventory_diffs)
        val operationsCount = operationRepository.count().toInt()
        operationRepository.deleteAll()
        stats["operations"] = operationsCount

        // Delete OZON posting items, then postings
        val postingItemsCount = ozonPostingItemRepository.count().toInt()
        ozonPostingItemRepository.deleteAll()
        stats["ozon_posting_items"] = postingItemsCount

        val postingsCount = ozonPostingRepository.count().toInt()
        ozonPostingRepository.deleteAll()
        stats["ozon_postings"] = postingsCount

        // Delete FBO supplies (items auto-deleted by CASCADE)
        val fboSuppliesCount = ozonFboSupplyRepository.count().toInt()
        ozonFboSupplyRepository.deleteAll()
        stats["ozon_fbo_supplies"] = fboSuppliesCount

        // Delete order lines, then import batches (sync results)
        val orderLinesCount = ozonOrderLineRepository.count().toInt()
        ozonOrderLineRepository.deleteAll()
        stats["ozon_order_lines"] = orderLinesCount

        val importBatchesCount = ozonOrderImportBatchRepository.count().toInt()
        ozonOrderImportBatchRepository.deleteAll()
        stats["ozon_order_import_batches"] = importBatchesCount

        // Reset product quantities to 0
        val products = productRepository.findAll()
        val resetCount = products.count { it.quantity != 0 }
        products.forEach { if (it.quantity != 0) it.quantity = 0 }
        productRepository.saveAll(products)
        stats["products_reset"] = resetCount

        return ResponseEntity.ok(mapOf(
            "success" to true,
            "message" to "Состояние успешно очищено",
            "stats" to stats
        ))
    }
}
