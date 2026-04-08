# API Reference

## Products — `/api/products`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products?search=` | List all, optional search by name/sku/custom_fields |
| GET | `/api/products/:id` | Single product |
| GET | `/api/products/:id/usage` | Check if product has operations (for delete safety) |
| POST | `/api/products` | Create (name, sku required) |
| PUT | `/api/products/:id` | Update |
| DELETE | `/api/products/:id` | Delete — blocked if product has operations |

## Product Fields — `/api/product-fields`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/product-fields` | List ordered by position |
| POST | `/api/product-fields` | Create (name, type, required, show_in_table, options, position) |
| PUT | `/api/product-fields/:id` | Update |
| DELETE | `/api/product-fields/:id` | Delete |

## Operations — `/api/operations`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/operations?type=&limit=&offset=&include_total=1&shipment_kind=fbs\|fbo\|manual` | List with optional filters |
| GET | `/api/operations/:id` | Single operation |
| POST | `/api/operations` | Create — handles receipt/shipment/inventory/writeoff/correction |
| PUT | `/api/operations/:id` | Update (rollbacks old, applies new) |
| DELETE | `/api/operations/:id` | Delete (rollbacks stock, unlinks OZON) |
| POST | `/api/operations/bulk-delete` | Atomic bulk delete with rollback |

### POST /operations body (shipment with shortage)
```json
{
  "type": "shipment",
  "operation_date": "2026-04-08",
  "note": "OZON FBS от 2026-04-08",
  "items": [{"productId": 1, "quantity": 5}],
  "allow_shortage": true,
  "shortage_adjustments": [{"productId": 1, "actual_remaining": 2, "reason": "Пересорт"}]
}
```
Creates both shipment and correction operations if shortages exist.

## Settings — `/api/settings/:key`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings/:key` | Get setting_value (user_id=1) |
| POST | `/api/settings/:key` | Save {value: any} |

## Stats — `/api/stats`, `/api/writeoffs`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | {totalProducts, totalQuantity, totalReceipts, totalShipments} |
| GET | `/api/writeoffs` | Writeoff list with product details |
| GET | `/api/writeoffs/summary` | Aggregated by product + reason |

## Google Sheets — `/api/google-sheets-*`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/google-sheets-config` | Get sync config |
| POST | `/api/google-sheets-config` | Save {spreadsheetId, sheetName, skuColumn, quantityColumn, startRow} |
| POST | `/api/google-sheets-test` | Test connection {spreadsheetId} |
| POST | `/api/google-sheets-sync` | Sync all products quantities |

## OZON — `/api/ozon/*`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ozon/settings` | Get OZON config |
| POST | `/api/ozon/settings` | Save {clientId, apiKey, syncStartDate} |
| GET | `/api/ozon/sync` | **SSE** — FBS sync from OZON API |
| GET | `/api/ozon/fbo/sync` | **SSE** — FBO sync from OZON API |
| POST | `/api/ozon/fbs/cancel` | Cancel running FBS sync |
| POST | `/api/ozon/fbo/cancel` | Cancel running FBO sync |
| GET | `/api/ozon/shipments` | Daily FBS shipment stats |
| GET | `/api/ozon/fbo/supplies` | Daily FBO supply stats |
| POST | `/api/ozon/shipments` | Create shipment operations from FBS days |
| POST | `/api/ozon/fbo/shipments` | Create shipment operations from FBO supplies |
| POST | `/api/ozon/products/sync` | Sync product images from OZON catalog |
| POST | `/api/ozon/fbs/shipments-from-csv` | Create shipments from parsed CSV data |
| POST | `/api/ozon/fbs/csv-analyze` | Analyze CSV data against existing operations |

## OZON Orders — `/api/ozon/orders/*`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ozon/orders/import` | Import CSV rows {source: 'fbs_csv'\|'fbo_csv', rows: []} |
| GET | `/api/ozon/orders/imports?limit=20` | List import batches |
| GET | `/api/ozon/orders/product/:id/stats` | Product warehouse + order stats |
| GET | `/api/ozon/orders/product/:id/timeline?limit=200&offset=0&all=1` | Combined warehouse + order timeline |

## Maintenance — `/api/maintenance/*`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/maintenance/reset-state` | Delete all operations, writeoffs, OZON data; reset product quantities to 0 |

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | {status: 'ok', timestamp} |
