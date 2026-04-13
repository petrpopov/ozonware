package com.ozonware.util

/**
 * Stable internal identifiers for system product fields managed by ProductFieldsService.
 *
 * `code` is the value stored in `product_fields.kind` — never changes regardless of
 * how the user renames the field's display name in the UI.
 */
enum class SystemFieldKind(val code: String) {
    OZON_SKU("ozon_sku"),
    OZON_ARTICLE("ozon_article"),
    OZON_PHOTO("ozon_photo")
}
