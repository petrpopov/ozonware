package com.ozonware.service

import com.ozonware.entity.ProductField
import com.ozonware.repository.ProductFieldRepository
import com.ozonware.repository.ProductFieldValueRepository
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
        val field = productFieldRepository.findByKind("ozon_photo") ?: return null
        return productFieldValueRepository.findByProductIdAndFieldId(productId, field.id ?: return null)?.valueText
    }

    /** Upsert a text value for the field identified by kind. No-op if field not found. */
    @Transactional
    fun writeTextValue(productId: Long, fieldKind: String, value: String) {
        val field = productFieldRepository.findByKind(fieldKind) ?: return
        val fid = field.id ?: return
        productFieldValueRepository.upsertTextValue(productId, fid, value)
    }

    /**
     * Sync product_field_values from a custom_fields list.
     * Upserts non-blank values; deletes the row when value is blank (field cleared).
     */
    @Transactional
    fun syncFieldValues(productId: Long, customFields: List<Map<String, Any>>) {
        for (cf in customFields) {
            val name = cf["name"] as? String ?: continue
            val value = cf["value"] as? String ?: continue
            val field = productFieldRepository.findByName(name) ?: continue
            val fid = field.id ?: continue
            if (value.isBlank()) {
                productFieldValueRepository.findByProductIdAndFieldId(productId, fid)
                    ?.id?.let { productFieldValueRepository.deleteById(it) }
            } else {
                productFieldValueRepository.upsertTextValue(productId, fid, value)
            }
        }
    }
}
