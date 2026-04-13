package com.ozonware.service

import com.ozonware.entity.lookup.*
import com.ozonware.repository.lookup.*
import org.springframework.stereotype.Service
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.concurrent.ConcurrentHashMap

/** In-memory-cached access to reference (lookup) tables — operation types, reasons, warehouses, statuses. */
@Service
class DictionariesService(
    private val operationTypeRepository: OperationTypeRepository,
    private val operationChannelRepository: OperationChannelRepository,
    private val writeoffReasonRepository: WriteoffReasonRepository,
    private val correctionReasonRepository: CorrectionReasonRepository,
    private val productFieldTypeRepository: ProductFieldTypeRepository,
    private val ozonPostingStatusRepository: OzonPostingStatusRepository,
    private val ozonSupplyStateRepository: OzonSupplyStateRepository,
    private val warehouseRepository: WarehouseRepository
) {
    private val cache = ConcurrentHashMap<String, List<*>>()

    @Suppress("UNCHECKED_CAST")
    private fun <T> cached(key: String, loader: () -> List<T>): List<T> =
        cache.getOrPut(key) { loader() } as List<T>

    fun invalidate(vararg keys: String) {
        if (keys.isEmpty()) cache.clear() else keys.forEach { cache.remove(it) }
    }

    // --- Getters ---

    fun getOperationTypes() = cached("operation_types") {
        operationTypeRepository.findAllByOrderByPositionAsc()
    }

    fun getOperationChannels() = cached("operation_channels") {
        operationChannelRepository.findAll()
    }

    fun getWriteoffReasons() = cached("writeoff_reasons") {
        writeoffReasonRepository.findAllByOrderByPositionAsc()
    }

    fun getCorrectionReasons() = cached("correction_reasons") {
        correctionReasonRepository.findAllByOrderByPositionAsc()
    }

    fun getProductFieldTypes() = cached("product_field_types") {
        productFieldTypeRepository.findAll()
    }

    fun getOzonPostingStatuses() = cached("ozon_posting_statuses") {
        ozonPostingStatusRepository.findAll()
    }

    fun getOzonSupplyStates() = cached("ozon_supply_states") {
        ozonSupplyStateRepository.findAll()
    }

    fun getWarehouses() = cached("warehouses") {
        warehouseRepository.findAll()
    }

    // --- WriteoffReason CRUD (non-system only) ---

    fun createWriteoffReason(code: String, label: String, affectsStock: Boolean = true): WriteoffReason {
        val nextPos = writeoffReasonRepository.findMaxPosition() + 10
        val entity = writeoffReasonRepository.save(
            WriteoffReason(code = code, label = label, affectsStock = affectsStock, isSystem = false, position = nextPos)
        )
        invalidate("writeoff_reasons")
        return entity
    }

    fun updateWriteoffReason(id: Long, label: String, affectsStock: Boolean): WriteoffReason {
        val entity = writeoffReasonRepository.findById(id).orElseThrow { NoSuchElementException("WriteoffReason $id not found") }
        require(!entity.isSystem) { "Cannot modify system entry" }
        val updated = writeoffReasonRepository.save(entity.copy(label = label, affectsStock = affectsStock))
        invalidate("writeoff_reasons")
        return updated
    }

    fun deleteWriteoffReason(id: Long) {
        val entity = writeoffReasonRepository.findById(id).orElseThrow { NoSuchElementException("WriteoffReason $id not found") }
        require(!entity.isSystem) { "Cannot delete system entry" }
        writeoffReasonRepository.deleteById(id)
        invalidate("writeoff_reasons")
    }

    // --- CorrectionReason CRUD (non-system only) ---

    fun createCorrectionReason(code: String, label: String): CorrectionReason {
        val nextPos = correctionReasonRepository.findMaxPosition() + 10
        val entity = correctionReasonRepository.save(
            CorrectionReason(code = code, label = label, isSystem = false, position = nextPos)
        )
        invalidate("correction_reasons")
        return entity
    }

    fun updateCorrectionReason(id: Long, label: String): CorrectionReason {
        val entity = correctionReasonRepository.findById(id).orElseThrow { NoSuchElementException("CorrectionReason $id not found") }
        require(!entity.isSystem) { "Cannot modify system entry" }
        val updated = correctionReasonRepository.save(entity.copy(label = label))
        invalidate("correction_reasons")
        return updated
    }

    fun deleteCorrectionReason(id: Long) {
        val entity = correctionReasonRepository.findById(id).orElseThrow { NoSuchElementException("CorrectionReason $id not found") }
        require(!entity.isSystem) { "Cannot delete system entry" }
        correctionReasonRepository.deleteById(id)
        invalidate("correction_reasons")
    }

    // --- Warehouse CRUD ---

    fun createWarehouse(name: String, address: String? = null, ozonWarehouseId: Long? = null): Warehouse {
        val now = LocalDateTime.now(ZoneOffset.UTC)
        val entity = warehouseRepository.save(
            Warehouse(ozonWarehouseId = ozonWarehouseId, name = name, address = address, createdAt = now, updatedAt = now)
        )
        invalidate("warehouses")
        return entity
    }

    fun updateWarehouse(id: Long, name: String, address: String?): Warehouse {
        val entity = warehouseRepository.findById(id).orElseThrow { NoSuchElementException("Warehouse $id not found") }
        val updated = warehouseRepository.save(
            entity.copy(name = name, address = address, updatedAt = LocalDateTime.now(ZoneOffset.UTC))
        )
        invalidate("warehouses")
        return updated
    }

    fun deleteWarehouse(id: Long) {
        warehouseRepository.findById(id).orElseThrow { NoSuchElementException("Warehouse $id not found") }
        warehouseRepository.deleteById(id)
        invalidate("warehouses")
    }

    // --- Upsert для OzonService ---

    fun upsertWarehouseByOzonId(ozonWarehouseId: Long, name: String, address: String?): Warehouse {
        val existing = warehouseRepository.findByOzonWarehouseId(ozonWarehouseId)
        val now = LocalDateTime.now(ZoneOffset.UTC)
        val entity = if (existing != null) {
            warehouseRepository.save(existing.copy(name = name, address = address, updatedAt = now))
        } else {
            warehouseRepository.save(Warehouse(ozonWarehouseId = ozonWarehouseId, name = name, address = address, createdAt = now, updatedAt = now))
        }
        invalidate("warehouses")
        return entity
    }

    fun normalizeOzonPostingStatus(rawStatus: String): String {
        // canceled → canonical cancelled
        if (rawStatus == "canceled") return "cancelled"
        val statuses = getOzonPostingStatuses()
        // Точное совпадение по code
        if (statuses.any { it.code == rawStatus }) return rawStatus
        // Поиск по csv_aliases
        return statuses.firstOrNull { rawStatus in it.csvAliases }?.code ?: rawStatus
    }
}
