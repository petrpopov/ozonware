package com.ozonware.service

import com.ozonware.dto.request.PlannedSupplyCreateRequest
import com.ozonware.entity.PlannedSupply
import com.ozonware.entity.PlannedSupplyItem
import com.ozonware.exception.BadRequestException
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.OperationItemRepository
import com.ozonware.repository.OperationRepository
import com.ozonware.repository.PlannedSupplyItemRepository
import com.ozonware.repository.PlannedSupplyRepository
import com.ozonware.repository.ProductRepository
import io.github.perplexhub.rsql.RSQLJPASupport
import org.slf4j.LoggerFactory
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.time.LocalDateTime

@Service
class PlannedSupplyService(
    private val plannedSupplyRepository: PlannedSupplyRepository,
    private val plannedSupplyItemRepository: PlannedSupplyItemRepository,
    private val productRepository: ProductRepository,
    private val operationRepository: OperationRepository,
    private val operationItemRepository: OperationItemRepository
) {
    companion object {
        private val log = LoggerFactory.getLogger(PlannedSupplyService::class.java)

        private const val STATUS_PLANNED = "planned"
        private const val STATUS_PARTIAL = "partial"
        private const val STATUS_MATCHED = "matched"
        private const val STATUS_CLOSED = "closed"
    }

    @Transactional
    fun createSupply(req: PlannedSupplyCreateRequest): Map<String, Any?> {
        require(req.title.isNotBlank()) { "Название плана обязательно" }

        val now = LocalDateTime.now()
        val supply = plannedSupplyRepository.save(
            PlannedSupply(
                title = req.title,
                supplier = req.supplier,
                purchaseDate = req.purchaseDate?.let { dateStr -> LocalDate.parse(dateStr) },
                expectedDate = req.expectedDate?.let { dateStr -> LocalDate.parse(dateStr) },
                note = req.note,
                sourceFile = req.sourceFile,
                status = STATUS_PLANNED,
                createdAt = now,
                updatedAt = now
            )
        )
        val items = saveItems(supply.id!!, req.items)
        activateCatalogProducts(items.mapNotNull { it.productId })

        return buildResponse(supply, items)
    }

    fun listSupplies(filter: String?, pageable: Pageable): Map<String, Any?> {
        val spec: Specification<PlannedSupply>? = filter?.let { RSQLJPASupport.toSpecification(it) }
        val page = if (spec != null)
            plannedSupplyRepository.findAll(spec, pageable)
        else
            plannedSupplyRepository.findAll(pageable)

        val ids = page.content.mapNotNull { supply -> supply.id }
        val itemCountBySupplyId = if (ids.isNotEmpty())
            plannedSupplyItemRepository.findAllByPlannedSupplyIdIn(ids)
                .groupBy { item -> item.plannedSupplyId }
                .mapValues { entry -> entry.value.size }
        else emptyMap()
        val receiptCountBySupplyId = if (ids.isNotEmpty())
            operationRepository.findAllByPlannedSupplyIdIn(ids)
                .groupBy { op -> op.plannedSupplyId }
                .mapValues { entry -> entry.value.size }
        else emptyMap()

        return mapOf(
            "items" to page.content.map { supply ->
                mapOf(
                    "id" to supply.id,
                    "title" to supply.title,
                    "supplier" to supply.supplier,
                    "purchase_date" to supply.purchaseDate?.toString(),
                    "expected_date" to supply.expectedDate?.toString(),
                    "status" to supply.status,
                    "created_at" to supply.createdAt?.toString(),
                    "updated_at" to supply.updatedAt?.toString(),
                    "item_count" to (itemCountBySupplyId[supply.id] ?: 0),
                    "receipt_count" to (receiptCountBySupplyId[supply.id] ?: 0)
                )
            },
            "total" to page.totalElements.toInt(),
            "limit" to pageable.pageSize,
            "offset" to (pageable.pageNumber * pageable.pageSize)
        )
    }

    fun getSupply(id: Long): Map<String, Any?> {
        val supply = plannedSupplyRepository.findById(id)
            .orElseThrow { ResourceNotFoundException("PlannedSupply not found: $id") }
        val items = plannedSupplyItemRepository.findAllByPlannedSupplyId(id)
        val operations = operationRepository.findByPlannedSupplyId(id)

        val directOpIds = operations.mapNotNull { op -> op.id }
        val correctionOps = if (directOpIds.isNotEmpty())
            operationRepository.findAllByParentOperationIdIn(directOpIds)
        else emptyList()
        val correctionsByParentId = correctionOps.groupBy { corr -> corr.parentOperationId }

        val correctionOpIds = correctionOps.mapNotNull { corr -> corr.id }
        val allOpIds = directOpIds + correctionOpIds
        val itemsByOpId = if (allOpIds.isNotEmpty())
            operationItemRepository.findAllByOperationIdIn(allOpIds).groupBy { opItem -> opItem.operationId }
        else emptyMap()

        val operationsResponse = operations.map { op ->
            val corrections = correctionsByParentId[op.id] ?: emptyList()
            val opItems = itemsByOpId[op.id] ?: emptyList()
            mapOf(
                "id" to op.id,
                "type_code" to op.typeCode,
                "channel_code" to op.channelCode,
                "operation_date" to op.operationDate?.toString(),
                "note" to op.note,
                "total_quantity" to op.totalQuantity,
                "created_at" to op.createdAt?.toString(),
                "items" to opItems.map { opItem ->
                    mapOf(
                        "product_id" to opItem.productId,
                        "sku" to opItem.productSkuSnapshot,
                        "product_name" to opItem.productNameSnapshot,
                        "quantity" to (opItem.delta?.toInt() ?: 0)
                    )
                },
                "corrections" to corrections.map { corr ->
                    val corrItems = itemsByOpId[corr.id] ?: emptyList()
                    mapOf(
                        "id" to corr.id,
                        "type_code" to corr.typeCode,
                        "note" to corr.note,
                        "operation_date" to corr.operationDate?.toString(),
                        "correction_reason_id" to corr.correctionReasonId,
                        "total_quantity" to corr.totalQuantity,
                        "items" to corrItems.map { opItem ->
                            mapOf(
                                "product_id" to opItem.productId,
                                "sku" to opItem.productSkuSnapshot,
                                "product_name" to opItem.productNameSnapshot,
                                "quantity" to (opItem.delta?.toInt() ?: 0)
                            )
                        }
                    )
                }
            )
        }

        return buildResponse(supply, items) + mapOf("operations" to operationsResponse)
    }

    @Transactional
    fun updateSupply(id: Long, req: PlannedSupplyCreateRequest): Map<String, Any?> {
        require(req.title.isNotBlank()) { "Название плана обязательно" }

        val supply = plannedSupplyRepository.findById(id)
            .orElseThrow { ResourceNotFoundException("PlannedSupply not found: $id") }

        if (supply.status != STATUS_PLANNED) {
            throw BadRequestException("Редактирование доступно только для плана со статусом 'planned'")
        }
        val linkedOps = operationRepository.findByPlannedSupplyId(id)
        if (linkedOps.isNotEmpty()) {
            throw BadRequestException("Нельзя редактировать план с привязанными приёмками")
        }

        supply.title = req.title
        supply.supplier = req.supplier
        supply.purchaseDate = req.purchaseDate?.let { dateStr -> LocalDate.parse(dateStr) }
        supply.expectedDate = req.expectedDate?.let { dateStr -> LocalDate.parse(dateStr) }
        supply.note = req.note
        supply.sourceFile = req.sourceFile
        supply.updatedAt = LocalDateTime.now()
        plannedSupplyRepository.save(supply)

        plannedSupplyItemRepository.deleteAllByPlannedSupplyId(id)
        val items = saveItems(id, req.items)
        activateCatalogProducts(items.mapNotNull { it.productId })

        return buildResponse(supply, items)
    }

    @Transactional
    fun deleteSupply(id: Long) {
        val supply = plannedSupplyRepository.findById(id)
            .orElseThrow { ResourceNotFoundException("PlannedSupply not found: $id") }

        val linkedOps = operationRepository.findByPlannedSupplyId(id)
        if (linkedOps.isNotEmpty()) {
            throw BadRequestException("Нельзя удалить план с привязанными приёмками")
        }

        plannedSupplyRepository.delete(supply)
    }

    @Transactional
    fun updateDates(id: Long, purchaseDateStr: String?, expectedDateStr: String?): Map<String, Any?> {
        val supply = plannedSupplyRepository.findById(id)
            .orElseThrow { ResourceNotFoundException("PlannedSupply not found: $id") }

        supply.purchaseDate = purchaseDateStr?.takeIf { it.isNotBlank() }?.let { LocalDate.parse(it) }
        supply.expectedDate = expectedDateStr?.takeIf { it.isNotBlank() }?.let { LocalDate.parse(it) }
        supply.updatedAt = LocalDateTime.now()
        plannedSupplyRepository.save(supply)

        val items = plannedSupplyItemRepository.findAllByPlannedSupplyId(id)

        return buildResponse(supply, items)
    }

    @Transactional
    fun closeSupply(id: Long, note: String?): Map<String, Any?> {
        val supply = plannedSupplyRepository.findById(id)
            .orElseThrow { ResourceNotFoundException("PlannedSupply not found: $id") }

        if (supply.status == STATUS_CLOSED) {
            throw BadRequestException("Поставка уже закрыта")
        }

        supply.status = STATUS_CLOSED
        if (note != null) {
            supply.note = if (supply.note.isNullOrBlank()) note else "${supply.note}\n$note"
        }
        supply.updatedAt = LocalDateTime.now()
        plannedSupplyRepository.save(supply)

        val items = plannedSupplyItemRepository.findAllByPlannedSupplyId(id)

        return buildResponse(supply, items)
    }

    @Transactional
    fun recalcStatus(id: Long) {
        val supply = plannedSupplyRepository.findById(id).orElse(null) ?: return

        if (supply.status == STATUS_CLOSED) {

            return
        }

        val operations = operationRepository.findByPlannedSupplyId(id)
        if (operations.isEmpty()) {
            if (supply.status != STATUS_PLANNED) {
                supply.status = STATUS_PLANNED
                supply.updatedAt = LocalDateTime.now()
                plannedSupplyRepository.save(supply)
            }
            return
        }

        val items = plannedSupplyItemRepository.findAllByPlannedSupplyId(id)
        if (items.isEmpty()) {

            return
        }

        // Aggregate factual quantities by SKU from all linked operations and their corrections
        val directOpIds = operations.mapNotNull { op -> op.id }
        val corrections = operationRepository.findAllByParentOperationIdIn(directOpIds)
        val allOpIds = (directOpIds + corrections.mapNotNull { corr -> corr.id }).toSet()
        val allOpItems = operationItemRepository.findAllByOperationIdIn(allOpIds)

        val factualBySku = mutableMapOf<String, Int>()
        for (opItem in allOpItems) {
            val delta = opItem.delta?.toInt() ?: 0
            if (delta != 0) {
                factualBySku.merge(opItem.productSkuSnapshot, delta, Int::plus)
            }
        }

        val allMatched = items.all { item ->
            val factual = factualBySku[item.sku] ?: 0
            factual == item.plannedQuantity
        }

        val newStatus = if (allMatched) STATUS_MATCHED else STATUS_PARTIAL

        if (supply.status != newStatus) {
            supply.status = newStatus
            supply.updatedAt = LocalDateTime.now()
            plannedSupplyRepository.save(supply)
            log.info("[recalcStatus] supply $id status changed to $newStatus")
        }
    }

    data class OpenSupplyInfo(val expectedDate: LocalDate?, val totalQuantity: Int)

    fun findSkusWithOpenSupplies(): Map<String, OpenSupplyInfo> {
        val openSupplies = plannedSupplyRepository.findAllByStatusNot(STATUS_CLOSED)
        if (openSupplies.isEmpty()) return emptyMap()

        val supplyById = openSupplies.associateBy { it.id!! }
        val supplyIds = supplyById.keys
        val items = plannedSupplyItemRepository.findAllByPlannedSupplyIdIn(supplyIds)

        val result = mutableMapOf<String, Pair<LocalDate?, Int>>()
        for (item in items) {
            val supply = supplyById[item.plannedSupplyId] ?: continue
            val existing = result[item.sku]
            val newQty = (existing?.second ?: 0) + item.plannedQuantity
            val newDate = when {
                existing?.first == null -> supply.expectedDate
                supply.expectedDate == null -> existing.first
                else -> minOf(existing.first!!, supply.expectedDate!!)
            }
            result[item.sku] = newDate to newQty
        }

        return result.mapValues { (_, v) -> OpenSupplyInfo(v.first, v.second) }
    }

    private fun buildResponse(supply: PlannedSupply, items: List<PlannedSupplyItem>): Map<String, Any?> {
        return mapOf(
            "id" to supply.id,
            "title" to supply.title,
            "supplier" to supply.supplier,
            "purchase_date" to supply.purchaseDate?.toString(),
            "expected_date" to supply.expectedDate?.toString(),
            "source_file" to supply.sourceFile,
            "note" to supply.note,
            "status" to supply.status,
            "created_at" to supply.createdAt?.toString(),
            "updated_at" to supply.updatedAt?.toString(),
            "items" to items.map { item ->
                mapOf(
                    "id" to item.id,
                    "sku" to item.sku,
                    "product_name" to item.productName,
                    "product_id" to item.productId,
                    "planned_quantity" to item.plannedQuantity
                )
            }
        )
    }

    private fun activateCatalogProducts(productIds: Collection<Long>) {
        if (productIds.isEmpty()) return
        val inactiveIds = productRepository.findAllById(productIds)
            .filter { !it.isActive }
            .mapNotNull { it.id }
        if (inactiveIds.isNotEmpty()) productRepository.activateAll(inactiveIds)
    }

    private fun saveItems(
        supplyId: Long,
        itemRequests: List<PlannedSupplyCreateRequest.ItemRequest>
    ): List<PlannedSupplyItem> {
        return itemRequests.map { itemReq ->
            require(itemReq.plannedQuantity > 0) {
                "planned_quantity должен быть > 0 для SKU ${itemReq.sku}"
            }

            val product = productRepository.findBySku(itemReq.sku).orElse(null)
            plannedSupplyItemRepository.save(
                PlannedSupplyItem(
                    plannedSupplyId = supplyId,
                    productId = product?.id,
                    sku = itemReq.sku,
                    productName = itemReq.productName ?: product?.name,
                    plannedQuantity = itemReq.plannedQuantity
                )
            )
        }
    }
}
