# Database Schema

## Core Tables

### products
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(255) NOT NULL | |
| sku | VARCHAR(100) UNIQUE NOT NULL | |
| quantity | INTEGER DEFAULT 0 CHECK >= 0 | |
| description | TEXT | |
| custom_fields | JSONB DEFAULT '[]' | [{name, type, value, required}] |
| created_at, updated_at | TIMESTAMP | Auto-updated via trigger |

Indexes: `sku`, `name`

### product_fields
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(255) NOT NULL | |
| type | VARCHAR(50) | barcode, text, number, color, image, select |
| required, show_in_table | BOOLEAN | |
| options | JSONB DEFAULT '[]' | For select type |
| position | INTEGER | Sort order |

### operations
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| type | VARCHAR(50) | receipt, shipment, inventory, writeoff, correction |
| operation_date | DATE | |
| note | TEXT | |
| items | JSONB DEFAULT '[]' | [{productId, productName, productSKU, quantity, appliedQuantity}] |
| total_quantity | INTEGER | |
| differences | JSONB DEFAULT '[]' | For inventory/correction |

Indexes: `type`, `operation_date`, `created_at`

### writeoffs
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| product_id | INTEGER FK→products ON DELETE CASCADE | |
| operation_id | INTEGER FK→operations ON DELETE CASCADE | |
| quantity | INTEGER NOT NULL CHECK > 0 | |
| reason | VARCHAR(50) | defect, loss, reserve |
| note | TEXT | |

### user_settings
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| user_id | INTEGER DEFAULT 1 | Single user |
| setting_key | VARCHAR(100) | |
| setting_value | JSONB | |
UNIQUE(user_id, setting_key)

Keys: `columns_order`, `google_sheets_config`, `ozon_settings`

## OZON Tables

### ozon_postings (FBS orders)
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| posting_number | VARCHAR(255) UNIQUE | |
| order_number | VARCHAR(255) | |
| status | VARCHAR(50) | awaiting_deliver, delivering, delivered |
| in_process_at | TIMESTAMP | |
| raw_data | JSONB | Full OZON response |
| shipment_applied | BOOLEAN DEFAULT FALSE | |
| shipment_operation_id | INTEGER FK→operations | |

Indexes: `posting_number`, `delivery_day`, `status`

### ozon_posting_items
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| posting_id | INTEGER FK→ozon_postings ON DELETE CASCADE | |
| ozon_sku | BIGINT | |
| product_id | INTEGER FK→products ON DELETE SET NULL | |
| quantity | INTEGER | |
| product_name | VARCHAR(500) | |
| offer_id | TEXT | |

### ozon_fbo_supplies
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| order_id, supply_id | BIGINT | |
| bundle_id | TEXT UNIQUE | |
| arrival_date, order_created_date | TIMESTAMPTZ | |
| warehouse_name, warehouse_address | TEXT | |
| shipment_applied | BOOLEAN DEFAULT FALSE | |
| shipment_operation_id | INTEGER FK→operations | |
| raw_order, raw_supply | JSONB | |

### ozon_fbo_supply_items
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| supply_id | INTEGER FK→ozon_fbo_supplies | |
| ozon_sku | TEXT | |
| product_id | INTEGER FK→products | |
| quantity | INTEGER | |
| offer_id, icon_path | TEXT | |

### ozon_daily_shipments
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| delivery_day | DATE UNIQUE | |
| shipment_id | INTEGER FK→shipments | |
| total_postings, total_items | INTEGER | |
| is_applied | BOOLEAN DEFAULT FALSE | |

### ozon_order_import_batches (CSV imports)
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| source | VARCHAR(32) | fbs_csv, fbo_csv |
| file_name | TEXT | |
| imported_at | TIMESTAMP | |
| rows_total/saved/updated/skipped/unmatched | INTEGER | |
| summary | JSONB | |

### ozon_order_lines
| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| external_line_key | TEXT UNIQUE | Dedup key |
| batch_id | INTEGER FK→ozon_order_import_batches | |
| posting_number, order_number | TEXT | |
| accepted_at, shipment_date, delivery_date, etc. | TIMESTAMP | |
| status | TEXT | |
| product_id | INTEGER FK→products ON DELETE SET NULL | |
| matched_by | TEXT | offer_id, ozon_sku, sku |
| raw | JSONB | |

Indexes: `product_id`, `source`, `accepted_at DESC`, `posting_number`

## Triggers

`update_updated_at_column()` — fires on UPDATE for `product_fields`, `products`, `operations`, `user_settings`.

## Stock Logic

Operations modify `products.quantity` transactionally:
- **receipt**: quantity += item.quantity
- **shipment**: quantity -= item.appliedQuantity (or item.quantity)
- **writeoff**: quantity -= item.quantity + writeoffs row
- **correction**: quantity += item.delta (can be negative)
- **inventory**: quantity = diff.actual (absolute set, only for products with differences)

Delete/rollback operations reverse these changes.

## Product Matching (OZON)

1. Custom field `OZON` with value `OZN<sku>` → match by `ozon_sku`
2. Custom field `Артикул OZON` with value = `offer_id` → match by offer
3. Offer ID with `_dm` suffix (discounted) → strip suffix, retry match
