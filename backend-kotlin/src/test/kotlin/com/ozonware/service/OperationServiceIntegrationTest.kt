package com.ozonware.service

import com.ozonware.IntegrationTestBase
import com.ozonware.entity.Operation
import com.ozonware.entity.OzonPosting
import com.ozonware.entity.Product
import com.ozonware.repository.OperationRepository
import com.ozonware.repository.OzonPostingRepository
import com.ozonware.repository.ProductRepository
import com.ozonware.repository.WriteoffRepository
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime

@Transactional
class OperationServiceIntegrationTest : IntegrationTestBase() {

    @Autowired lateinit var operationService: OperationService
    @Autowired lateinit var productRepository: ProductRepository
    @Autowired lateinit var operationRepository: OperationRepository
    @Autowired lateinit var writeoffRepository: WriteoffRepository
    @Autowired lateinit var ozonPostingRepository: OzonPostingRepository
    @Autowired lateinit var entityManager: EntityManager

    private fun product(sku: String, qty: Int = 10): Product =
        productRepository.save(Product(name = "Test $sku", sku = sku, quantity = qty))

    private fun flush() {
        entityManager.flush()
        entityManager.clear()
    }

    // ── Receipt ──────────────────────────────────────────────────────────────

    @Test
    fun createReceipt_updatesProductQuantity() {
        val p = product("W-RECEIPT", qty = 10)
        flush()

        val items = listOf(mapOf<String, Any?>("productId" to p.id, "quantity" to 5))
        operationService.createOperation("receipt", null, "Test receipt", items, 5, null, null, null)
        flush()

        val updated = productRepository.findById(p.id!!).get()
        assertThat(updated.quantity).isEqualTo(15)
    }

    // ── Shipment (no shortage) ────────────────────────────────────────────────

    @Test
    fun createShipment_withSufficientStock_createsOperationOnly() {
        val p = product("W-SHIP", qty = 10)
        flush()

        val items = listOf(mapOf<String, Any?>("productId" to p.id, "quantity" to 3))
        val result = operationService.createOperation(
            "shipment", null, "Test shipment", items, 3, null, false, emptyList()
        )
        flush()

        val updated = productRepository.findById(p.id!!).get()
        assertThat(updated.quantity).isEqualTo(7)
        assertThat(result["correction_operation_id"]).isNull()

        val opCount = operationRepository.count()
        assertThat(opCount).isEqualTo(1)
    }

    // ── Shipment with shortage ────────────────────────────────────────────────

    @Test
    fun createShipment_withShortage_createsShipmentAndCorrection() {
        val p = product("W-SHORT", qty = 3)
        flush()

        // Requested 5, available 3, actual_remaining = 1
        val items = listOf(mapOf<String, Any?>("productId" to p.id, "quantity" to 5))
        val adjustments = listOf(
            mapOf<String, Any?>(
                "productId" to p.id,
                "actual_remaining" to 1,
                "reason" to "Потеря на складе"
            )
        )
        val result = operationService.createOperation(
            "shipment", "2026-01-15", "FBS test", items, 5, null, true, adjustments
        )
        flush()

        // Product set to actual_remaining = 1
        val updated = productRepository.findById(p.id!!).get()
        assertThat(updated.quantity).isEqualTo(1)

        // Correction operation was created
        val correctionId = result["correction_operation_id"] as? Long
        assertThat(correctionId).isNotNull()

        val correction = operationRepository.findById(correctionId!!).get()
        assertThat(correction.typeCode).isEqualTo("correction")
        assertThat(correction.note).contains("Корректировка после отгрузки #${result["id"]}.")
    }

    // ── Update shipment rolls back + deletes old correction ───────────────────

    @Test
    fun updateShipment_rollsBackPreviousAndDeletesOldCorrection() {
        val p = product("W-UPDATE", qty = 5)
        flush()

        // Create shipment with shortage: requested=7, actual_remaining=2
        val items = listOf(mapOf<String, Any?>("productId" to p.id, "quantity" to 7))
        val adjustments = listOf(
            mapOf<String, Any?>("productId" to p.id, "actual_remaining" to 2, "reason" to "Потеря")
        )
        val created = operationService.createOperation(
            "shipment", "2026-01-15", "First shipment", items, 7, null, true, adjustments
        )
        flush()

        val shipmentId = (created["id"] as Number).toLong()
        val oldCorrectionId = (created["correction_operation_id"] as Number).toLong()
        // product.qty = actual_remaining = 2

        // Rollback oldOp.items: appliedQty = 5-2=3, so rollback adds +3 → qty=5
        // Update: new items qty=2, sufficient (5>=2) → newQty=3
        val newItems = listOf(mapOf<String, Any?>("productId" to p.id, "quantity" to 2))
        operationService.updateOperation(
            shipmentId, "2026-01-15", "Updated shipment", newItems, 2, null, false, emptyList()
        )
        flush()

        // Old correction deleted
        assertThat(operationRepository.findById(oldCorrectionId)).isEmpty

        // Product quantity: rollback +3 → 5, then -2 → 3
        val updated = productRepository.findById(p.id!!).get()
        assertThat(updated.quantity).isEqualTo(3)

        // No new correction
        val correctionCount = operationRepository.countByType("correction")
        assertThat(correctionCount).isEqualTo(0)
    }

    // ── Delete shipment ────────────────────────────────────────────────────────

    @Test
    fun deleteShipment_restoresQuantityAndUnlinksOzonPosting() {
        val p = product("W-DEL", qty = 10)
        val posting = ozonPostingRepository.save(
            OzonPosting(
                postingNumber = "TEST-DEL-001",
                orderNumber = "ORDER-001",
                status = "delivered",
                inProcessAt = LocalDateTime.of(2026, 1, 15, 10, 0)
            )
        )
        flush()

        val items = listOf(mapOf<String, Any?>("productId" to p.id, "quantity" to 4))
        val result = operationService.createOperation(
            "shipment", "2026-01-15", "OZON FBS от 2026-01-15", items, 4, null, false, emptyList()
        )
        flush()

        val opId = (result["id"] as Number).toLong()

        // Manually link posting to operation (simulating what createShipments does)
        posting.shipmentOperationId = opId
        posting.shipmentApplied = true
        ozonPostingRepository.save(posting)
        flush()

        operationService.deleteOperation(opId)
        flush()

        // Quantity restored
        val updatedProduct = productRepository.findById(p.id!!).get()
        assertThat(updatedProduct.quantity).isEqualTo(10)

        // Posting unlinked
        val updatedPosting = ozonPostingRepository.findById(posting.id!!).get()
        assertThat(updatedPosting.shipmentOperationId).isNull()
        assertThat(updatedPosting.shipmentApplied).isFalse()
    }

    // ── Bulk delete ────────────────────────────────────────────────────────────

    @Test
    fun bulkDelete_rollsBackQuantitiesForMixedOperations() {
        val p = product("W-BULK", qty = 10)
        flush()

        // Receipt +5 → qty=15
        val receiptItems = listOf(mapOf<String, Any?>("productId" to p.id, "quantity" to 5))
        val receipt = operationService.createOperation("receipt", null, "Receipt", receiptItems, 5, null, null, null)
        flush()

        // Shipment -3 → qty=12
        val shipmentItems = listOf(mapOf<String, Any?>("productId" to p.id, "quantity" to 3))
        val shipment = operationService.createOperation(
            "shipment", null, "Shipment", shipmentItems, 3, null, false, emptyList()
        )
        flush()

        val receiptId = (receipt["id"] as Number).toLong()
        val shipmentId = (shipment["id"] as Number).toLong()

        operationService.bulkDeleteOperations(listOf(receiptId, shipmentId))
        flush()

        // receipt rollback: -5 → 12-5=7, shipment rollback: +3 → 7+3=10
        val updated = productRepository.findById(p.id!!).get()
        assertThat(updated.quantity).isEqualTo(10)

        assertThat(operationRepository.count()).isEqualTo(0)
    }

    // ── Inventory ──────────────────────────────────────────────────────────────

    @Test
    fun createInventory_updatesQuantitiesToActual() {
        val p1 = product("W-INV-1", qty = 10)
        val p2 = product("W-INV-2", qty = 5)
        flush()

        val differences = listOf(
            mapOf<String, Any?>("productId" to p1.id, "expected" to 10, "actual" to 8),
            mapOf<String, Any?>("productId" to p2.id, "expected" to 5, "actual" to 7)
        )
        operationService.createOperation(
            "inventory", "2026-01-15", "Monthly inventory", null, 0, differences, null, null
        )
        flush()

        val updated1 = productRepository.findById(p1.id!!).get()
        val updated2 = productRepository.findById(p2.id!!).get()

        assertThat(updated1.quantity).isEqualTo(8)
        assertThat(updated2.quantity).isEqualTo(7)
    }

    // ── Writeoff ──────────────────────────────────────────────────────────────

    @Test
    fun createWriteoff_createsWriteoffRowAndReducesQuantity() {
        val p = product("W-WO", qty = 20)
        flush()

        val items = listOf(
            mapOf<String, Any?>("productId" to p.id, "quantity" to 3, "reason" to "defect", "note" to "Broken")
        )
        operationService.createOperation("writeoff", "2026-01-15", "Defect writeoff", items, 3, null, null, null)
        flush()

        // Quantity reduced
        val updated = productRepository.findById(p.id!!).get()
        assertThat(updated.quantity).isEqualTo(17)

        // Writeoff row created
        val writeoffs = writeoffRepository.findAllWithProduct()
        assertThat(writeoffs).hasSize(1)
        assertThat(writeoffs[0].quantity).isEqualTo(3)
        assertThat(writeoffs[0].reason).isEqualTo("defect")
    }
}
