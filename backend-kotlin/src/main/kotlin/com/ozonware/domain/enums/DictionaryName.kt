package com.ozonware.domain.enums

import com.ozonware.exception.BadRequestException

enum class DictionaryName(val value: String) {
    OPERATION_TYPES("operation_types"),
    OPERATION_CHANNELS("operation_channels"),
    WRITEOFF_REASONS("writeoff_reasons"),
    CORRECTION_REASONS("correction_reasons"),
    PRODUCT_FIELD_TYPES("product_field_types"),
    OZON_POSTING_STATUSES("ozon_posting_statuses"),
    OZON_SUPPLY_STATES("ozon_supply_states"),
    WAREHOUSES("warehouses");

    companion object {
        fun fromValue(value: String): DictionaryName =
            entries.firstOrNull { it.value == value }
                ?: throw BadRequestException("Unknown dictionary: $value")
    }
}
