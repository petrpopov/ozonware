package com.ozonware.service

import com.ozonware.repository.OperationRepository
import com.ozonware.repository.OzonFboSupplyRepository
import com.ozonware.repository.OzonOrderImportBatchRepository
import com.ozonware.repository.OzonOrderLineRepository
import com.ozonware.repository.OzonPostingItemRepository
import com.ozonware.repository.OzonPostingRepository
import com.ozonware.repository.ProductRepository
import com.ozonware.repository.WriteoffRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** Administrative maintenance — resets all transactional state and product quantities to zero. */
@Service
class MaintenanceService(
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
    fun resetState(): Map<String, Any> {
        val stats = mutableMapOf<String, Int>()

        // Delete writeoffs (before operations due to FK)
        stats["writeoffs"] = writeoffRepository.count().toInt()
        writeoffRepository.deleteAll()

        // Delete operations (cascades: operation_items, operation_inventory_diffs)
        stats["operations"] = operationRepository.count().toInt()
        operationRepository.deleteAll()

        // Delete OZON posting items, then postings
        stats["ozon_posting_items"] = ozonPostingItemRepository.count().toInt()
        ozonPostingItemRepository.deleteAll()

        stats["ozon_postings"] = ozonPostingRepository.count().toInt()
        ozonPostingRepository.deleteAll()

        // Delete FBO supplies (items auto-deleted by CASCADE)
        stats["ozon_fbo_supplies"] = ozonFboSupplyRepository.count().toInt()
        ozonFboSupplyRepository.deleteAll()

        // Delete order lines, then import batches (sync results)
        stats["ozon_order_lines"] = ozonOrderLineRepository.count().toInt()
        ozonOrderLineRepository.deleteAll()

        stats["ozon_order_import_batches"] = ozonOrderImportBatchRepository.count().toInt()
        ozonOrderImportBatchRepository.deleteAll()

        // Reset product quantities to 0
        val products = productRepository.findAll()
        val resetCount = products.count { it.quantity != 0 }
        products.forEach { if (it.quantity != 0) it.quantity = 0 }
        productRepository.saveAll(products)
        stats["products_reset"] = resetCount

        return mapOf(
            "success" to true,
            "message" to "Состояние успешно очищено",
            "stats" to stats
        )
    }
}
