package com.ozonware.service

import com.ozonware.entity.ProductField
import com.ozonware.repository.ProductFieldRepository
import com.ozonware.repository.ProductFieldValueRepository
import com.ozonware.util.SystemFieldKind
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Normalized product-field operations: system-field bootstrap, EAV value write.
 * Used alongside legacy dual-write to products.custom_fields during migration.
 */
@Service
class ProductFieldsService(
    private val productFieldRepository: ProductFieldRepository,
    private val productFieldValueRepository: ProductFieldValueRepository
) {
    companion object {
        private val log = LoggerFactory.getLogger(ProductFieldsService::class.java)
    }

    /**
     * На старте:
     * 1. Миграция — исправляет kind у полей найденных по историческому display name (разовая операция).
     * 2. Гарантия — создаёт системные поля если их нет в БД по kind (fail-safe при ручном удалении).
     */
    @PostConstruct
    @Transactional
    fun bootstrapSystemFieldKinds() {
        // Step 1: migration — fix kind by legacy display name (historical V10 mapping)
        val legacyNameToKind = mapOf(
            "OZON" to SystemFieldKind.OZON_SKU,
            "Артикул OZON" to SystemFieldKind.OZON_ARTICLE,
            "Фото OZON" to SystemFieldKind.OZON_PHOTO
        )
        for ((name, fieldKind) in legacyNameToKind) {
            val field = productFieldRepository.findByName(name) ?: continue
            if (field.kind != fieldKind.code) {
                field.kind = fieldKind.code
                field.isSystem = true
                productFieldRepository.save(field)
                log.info("[ProductFieldsService] bootstrap: поле '{}' → kind='{}'", name, fieldKind.code)
            }
        }

        // Step 2: guarantee — create any system field missing by kind
        val kindToDefaultName = legacyNameToKind.entries.associate { it.value to it.key }
        for (fieldKind in SystemFieldKind.entries) {
            if (productFieldRepository.findByKind(fieldKind.code) == null) {
                val displayName = kindToDefaultName[fieldKind] ?: fieldKind.code
                val maxPos = productFieldRepository.findAll().maxOfOrNull { it.position } ?: 0
                productFieldRepository.save(
                    ProductField(
                        name = displayName,
                        type = "text",
                        typeCode = "text",
                        kind = fieldKind.code,
                        isSystem = true,
                        required = false,
                        showInTable = false,
                        position = maxPos + 10
                    )
                )
                log.info("[ProductFieldsService] bootstrap: создано системное поле kind='{}' name='{}'", fieldKind.code, displayName)
            }
        }
    }

    /** Ensure a system field with the given name exists; create if absent. */
    @Transactional
    fun ensureSystemField(name: String, kind: String, typeCode: String): ProductField {
        return productFieldRepository.findByName(name) ?: run {
            val maxPos = productFieldRepository.findAll().maxOfOrNull { it.position } ?: 0
            productFieldRepository.save(
                ProductField(
                    name = name,
                    type = typeCode,
                    typeCode = typeCode,
                    kind = kind,
                    isSystem = true,
                    required = false,
                    showInTable = false,
                    position = maxPos + 10
                )
            )
        }
    }

    fun getFieldByKind(kind: String): ProductField? = productFieldRepository.findByKind(kind)

    /** Returns [{name, value}] for all defined fields; empty string for unset values. */
    fun readCustomFields(productId: Long): List<Map<String, Any>> {
        val fields = productFieldRepository.findAllByOrderByPositionAsc()
        val values = productFieldValueRepository.findAllByProductId(productId)
        val byFieldId = values.associate { it.fieldId to it }
        return fields.map { field ->
            val pv = byFieldId[field.id]
            val value = pv?.valueText ?: pv?.valueNumber?.toPlainString() ?: pv?.valueColor ?: ""
            mapOf("name" to field.name, "value" to value)
        }
    }

    /** Returns the stored photo URL for a product, or null if absent. */
    fun readPhotoUrl(productId: Long): String? {
        val field = productFieldRepository.findByKind(SystemFieldKind.OZON_PHOTO.code) ?: return null
        return productFieldValueRepository.findByProductIdAndFieldId(productId, field.id ?: return null)?.valueText
    }

    /**
     * Upsert a text value for the field identified by kind.
     * @throws IllegalStateException if the field is not found — indicates a bootstrap failure.
     */
    @Transactional
    fun writeTextValue(productId: Long, fieldKind: String, value: String) {
        val field = productFieldRepository.findByKind(fieldKind)
            ?: throw IllegalStateException("Field kind='$fieldKind' not found for productId=$productId — bootstrap may have failed")
        val fid = field.id
            ?: throw IllegalStateException("Field kind='$fieldKind' has null id")
        productFieldValueRepository.upsertTextValue(productId, fid, value)
        log.debug("[ProductFieldsService] writeTextValue: productId={} fieldKind='{}' len={}", productId, fieldKind, value.length)
    }

    /**
     * Sync product_field_values from a custom_fields list.
     * Upserts non-blank values; deletes the row when value is blank (field cleared).
     */
    @Transactional
    fun syncFieldValues(productId: Long, customFields: List<Map<String, Any>>) {
        var updated = 0
        var deleted = 0
        var skipped = 0
        for (cf in customFields) {
            val name = cf["name"] as? String ?: continue
            val value = cf["value"] as? String ?: continue
            val field = productFieldRepository.findByName(name)
            if (field == null) { skipped++; continue }
            val fid = field.id ?: continue
            if (value.isBlank()) {
                productFieldValueRepository.findByProductIdAndFieldId(productId, fid)
                    ?.id?.let { productFieldValueRepository.deleteById(it) }
                deleted++
            } else {
                productFieldValueRepository.upsertTextValue(productId, fid, value)
                updated++
            }
        }
        if (updated + deleted > 0) {
            log.info("[ProductFieldsService] syncFieldValues: productId={} updated={} deleted={} skipped={}",
                productId, updated, deleted, skipped)
        }
    }
}
