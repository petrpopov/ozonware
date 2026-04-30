// Canonical kind codes for system product fields (set by backend on Phase 2 migration).
// Components should compare by kind when available, or use these name constants
// for custom_fields lookups during the dual-write period (until Phase 7).

export const FIELD_KIND_OZON_PHOTO   = 'ozon_photo';
export const FIELD_KIND_OZON_ARTICLE = 'ozon_article';
export const FIELD_KIND_OZON_SKU     = 'ozon_sku';

// Legacy field names used as keys in products.custom_fields (removed in Phase 7).
export const FIELD_NAME_OZON_PHOTO   = 'Фото';
export const FIELD_NAME_OZON_ARTICLE = 'Артикул OZON';
export const FIELD_NAME_OZON_SKU     = 'OZON';
