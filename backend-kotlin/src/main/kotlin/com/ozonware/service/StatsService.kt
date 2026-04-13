package com.ozonware.service

import com.ozonware.repository.OperationRepository
import com.ozonware.repository.ProductRepository
import com.ozonware.repository.WriteoffRepository
import org.springframework.stereotype.Service

/** Aggregate warehouse stats — product totals, writeoff details and summaries via repository queries. */
@Service
class StatsService(
    private val productRepository: ProductRepository,
    private val operationRepository: OperationRepository,
    private val writeoffRepository: WriteoffRepository
) {

    fun getStats(): Map<String, Int> {
        val totalProducts = productRepository.count().toInt()
        val totalQuantity = productRepository.findAll().sumOf { it.quantity }
        val totalReceipts = operationRepository.countByType("receipt").toInt()
        val totalShipments = operationRepository.countByType("shipment").toInt()

        return mapOf(
            "totalProducts" to totalProducts,
            "totalQuantity" to totalQuantity,
            "totalReceipts" to totalReceipts,
            "totalShipments" to totalShipments
        )
    }

    fun getWriteoffs(): List<Map<String, Any?>> {
        return writeoffRepository.findAllWithProduct().map { w ->
            mapOf(
                "id" to w.id,
                "product_id" to w.product?.id,
                "operation_id" to w.operation?.id,
                "quantity" to w.quantity,
                "reason" to w.reason,
                "note" to w.note,
                "product_name" to w.product?.name,
                "product_sku" to w.product?.sku,
                "current_quantity" to w.product?.quantity,
                "created_at" to w.createdAt?.toString(),
                "updated_at" to w.updatedAt?.toString()
            )
        }
    }

    fun getWriteoffsSummary(): List<Map<String, Any?>> {
        @Suppress("UNCHECKED_CAST")
        val rawResult = writeoffRepository.findSummary() as List<Map<String, Any>>
        return rawResult.map { row ->
            mapOf(
                "product_id" to row["productId"],
                "product_name" to row["productName"],
                "product_sku" to row["productSku"],
                "reason" to row["reason"],
                "total_quantity" to row["totalQuantity"],
                "operations_count" to row["operationsCount"]
            )
        }
    }
}
