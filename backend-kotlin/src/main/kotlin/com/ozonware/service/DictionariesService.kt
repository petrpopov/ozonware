package com.ozonware.service

import com.ozonware.domain.enums.DictionaryName
import com.ozonware.dto.request.DictionaryItemRequest
import com.ozonware.entity.lookup.*
import com.ozonware.exception.BadRequestException
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
    private fun <T : DictionaryEntry> cached(dict: DictionaryName, loader: () -> List<T>): List<T> =
        cache.getOrPut(dict.value) { loader() } as List<T>

    fun invalidate(vararg dicts: DictionaryName) {
        if (dicts.isEmpty()) cache.clear() else dicts.forEach { cache.remove(it.value) }
    }

    // --- Public API ---

    fun list(dict: DictionaryName): List<Map<String, Any?>> = when (dict) {
        DictionaryName.OPERATION_TYPES       -> cached(dict) { operationTypeRepository.findAllByOrderByPositionAsc() }
        DictionaryName.OPERATION_CHANNELS    -> cached(dict) { operationChannelRepository.findAll() }
        DictionaryName.WRITEOFF_REASONS      -> cached(dict) { writeoffReasonRepository.findAllByOrderByPositionAsc() }
        DictionaryName.CORRECTION_REASONS    -> cached(dict) { correctionReasonRepository.findAllByOrderByPositionAsc() }
        DictionaryName.PRODUCT_FIELD_TYPES   -> cached(dict) { productFieldTypeRepository.findAll() }
        DictionaryName.OZON_POSTING_STATUSES -> cached(dict) { ozonPostingStatusRepository.findAll() }
        DictionaryName.OZON_SUPPLY_STATES    -> cached(dict) { ozonSupplyStateRepository.findAll() }
        DictionaryName.WAREHOUSES            -> cached(dict) { warehouseRepository.findAll() }
    }.map { it.toMap() }

    fun create(dict: DictionaryName, req: DictionaryItemRequest): Map<String, Any?> = when (dict) {
        DictionaryName.WRITEOFF_REASONS -> createWriteoffReason(
            code = req.code ?: throw BadRequestException("code required"),
            label = req.label ?: throw BadRequestException("label required"),
            affectsStock = req.affectsStock
        ).toMap()
        DictionaryName.CORRECTION_REASONS -> createCorrectionReason(
            code = req.code ?: throw BadRequestException("code required"),
            label = req.label ?: throw BadRequestException("label required")
        ).toMap()
        DictionaryName.WAREHOUSES -> createWarehouse(
            name = req.name ?: throw BadRequestException("name required"),
            address = req.address
        ).toMap()
        else -> throw BadRequestException("Dictionary ${dict.value} is read-only")
    }

    fun update(dict: DictionaryName, id: Long, req: DictionaryItemRequest): Map<String, Any?> = when (dict) {
        DictionaryName.WRITEOFF_REASONS -> updateWriteoffReason(
            id = id,
            label = req.label ?: throw BadRequestException("label required"),
            affectsStock = req.affectsStock
        ).toMap()
        DictionaryName.CORRECTION_REASONS -> updateCorrectionReason(
            id = id,
            label = req.label ?: throw BadRequestException("label required")
        ).toMap()
        DictionaryName.WAREHOUSES -> updateWarehouse(
            id = id,
            name = req.name ?: throw BadRequestException("name required"),
            address = req.address
        ).toMap()
        else -> throw BadRequestException("Dictionary ${dict.value} is read-only")
    }

    fun delete(dict: DictionaryName, id: Long) = when (dict) {
        DictionaryName.WRITEOFF_REASONS   -> deleteWriteoffReason(id)
        DictionaryName.CORRECTION_REASONS -> deleteCorrectionReason(id)
        DictionaryName.WAREHOUSES         -> deleteWarehouse(id)
        else -> throw BadRequestException("Dictionary ${dict.value} is read-only")
    }

    // --- WriteoffReason CRUD (non-system only) ---

    fun createWriteoffReason(code: String, label: String, affectsStock: Boolean = true): WriteoffReason {
        val nextPos = writeoffReasonRepository.findMaxPosition() + 10
        val entity = writeoffReasonRepository.save(
            WriteoffReason(code = code, label = label, affectsStock = affectsStock, isSystem = false, position = nextPos)
        )
        invalidate(DictionaryName.WRITEOFF_REASONS)

        return entity
    }

    fun updateWriteoffReason(id: Long, label: String, affectsStock: Boolean): WriteoffReason {
        val entity = writeoffReasonRepository.findById(id).orElseThrow { NoSuchElementException("WriteoffReason $id not found") }
        require(!entity.isSystem) { "Cannot modify system entry" }
        val updated = writeoffReasonRepository.save(entity.copy(label = label, affectsStock = affectsStock))
        invalidate(DictionaryName.WRITEOFF_REASONS)

        return updated
    }

    fun deleteWriteoffReason(id: Long) {
        val entity = writeoffReasonRepository.findById(id).orElseThrow { NoSuchElementException("WriteoffReason $id not found") }
        require(!entity.isSystem) { "Cannot delete system entry" }
        writeoffReasonRepository.deleteById(id)
        invalidate(DictionaryName.WRITEOFF_REASONS)
    }

    // --- CorrectionReason CRUD (non-system only) ---

    fun createCorrectionReason(code: String, label: String): CorrectionReason {
        val nextPos = correctionReasonRepository.findMaxPosition() + 10
        val entity = correctionReasonRepository.save(
            CorrectionReason(code = code, label = label, isSystem = false, position = nextPos)
        )
        invalidate(DictionaryName.CORRECTION_REASONS)

        return entity
    }

    fun updateCorrectionReason(id: Long, label: String): CorrectionReason {
        val entity = correctionReasonRepository.findById(id).orElseThrow { NoSuchElementException("CorrectionReason $id not found") }
        require(!entity.isSystem) { "Cannot modify system entry" }
        val updated = correctionReasonRepository.save(entity.copy(label = label))
        invalidate(DictionaryName.CORRECTION_REASONS)

        return updated
    }

    fun deleteCorrectionReason(id: Long) {
        val entity = correctionReasonRepository.findById(id).orElseThrow { NoSuchElementException("CorrectionReason $id not found") }
        require(!entity.isSystem) { "Cannot delete system entry" }
        correctionReasonRepository.deleteById(id)
        invalidate(DictionaryName.CORRECTION_REASONS)
    }

    // --- Warehouse CRUD ---

    fun createWarehouse(name: String, address: String? = null, ozonWarehouseId: Long? = null): Warehouse {
        val now = LocalDateTime.now(ZoneOffset.UTC)
        val entity = warehouseRepository.save(
            Warehouse(ozonWarehouseId = ozonWarehouseId, name = name, address = address, createdAt = now, updatedAt = now)
        )
        invalidate(DictionaryName.WAREHOUSES)

        return entity
    }

    fun updateWarehouse(id: Long, name: String, address: String?): Warehouse {
        val entity = warehouseRepository.findById(id).orElseThrow { NoSuchElementException("Warehouse $id not found") }
        val updated = warehouseRepository.save(
            entity.copy(name = name, address = address, updatedAt = LocalDateTime.now(ZoneOffset.UTC))
        )
        invalidate(DictionaryName.WAREHOUSES)

        return updated
    }

    fun deleteWarehouse(id: Long) {
        warehouseRepository.findById(id).orElseThrow { NoSuchElementException("Warehouse $id not found") }
        warehouseRepository.deleteById(id)
        invalidate(DictionaryName.WAREHOUSES)
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
        invalidate(DictionaryName.WAREHOUSES)

        return entity
    }

    fun normalizeOzonPostingStatus(rawStatus: String): String {
        if (rawStatus == "canceled") return "cancelled"
        val statuses = cached(DictionaryName.OZON_POSTING_STATUSES) { ozonPostingStatusRepository.findAll() }
        if (statuses.any { it.code == rawStatus }) return rawStatus

        return statuses.firstOrNull { rawStatus in it.csvAliases }?.code ?: rawStatus
    }
}
