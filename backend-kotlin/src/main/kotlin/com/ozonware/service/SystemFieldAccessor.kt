package com.ozonware.service

import com.ozonware.entity.ProductFieldValue
import com.ozonware.repository.ProductFieldValueRepository
import com.ozonware.util.SystemFieldKind
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Typed facade for EAV access to system product fields.
 *
 * Accepts [SystemFieldKind] instead of raw kind strings — guarantees compile-time safety.
 * After [ProductFieldsService.bootstrapSystemFieldKinds] all system fields are guaranteed to exist,
 * so [writeText] throws [IllegalStateException] instead of silently no-oping on a missing field.
 */
@Service
class SystemFieldAccessor(
    private val productFieldsService: ProductFieldsService,
    private val productFieldValueRepository: ProductFieldValueRepository
) {
    companion object {
        private val log = LoggerFactory.getLogger(SystemFieldAccessor::class.java)
    }

    /** Returns all EAV value rows for the given system field kind. */
    fun findAllValues(kind: SystemFieldKind): List<ProductFieldValue> =
        productFieldValueRepository.findAllByFieldKind(kind.code)

    /** Returns the stored text value for a product's system field, or null if not set. */
    fun readText(productId: Long, kind: SystemFieldKind): String? {
        val field = productFieldsService.getFieldByKind(kind.code) ?: return null
        return productFieldValueRepository.findByProductIdAndFieldId(productId, field.id ?: return null)?.valueText
    }

    /**
     * Upserts a text value for a system field.
     *
     * @throws IllegalStateException if the field is missing in the DB — indicates a failed bootstrap.
     */
    @Transactional
    fun writeText(productId: Long, kind: SystemFieldKind, value: String) {
        val field = productFieldsService.getFieldByKind(kind.code)
            ?: throw IllegalStateException("System field '${kind.code}' not found — bootstrap may have failed")
        val fid = field.id
            ?: throw IllegalStateException("System field '${kind.code}' has null id")
        productFieldValueRepository.upsertTextValue(productId, fid, value)
        log.debug("[SystemFieldAccessor] writeText: productId={} kind='{}' len={}", productId, kind.code, value.length)
    }
}
