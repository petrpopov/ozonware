-- V12: Phase 3 — backfill operation_items + operation_inventory_diffs from JSONB.

-- receipt / shipment / writeoff / correction: items → operation_items
INSERT INTO operation_items (
    operation_id, product_id,
    requested_qty, applied_qty, delta,
    writeoff_reason_id, writeoff_reason_text,
    product_name_snapshot, product_sku_snapshot, item_note
)
SELECT
    o.id,
    NULLIF(it->>'productId', '')::bigint,
    COALESCE(NULLIF(it->>'quantity',       '')::numeric, 0),
    COALESCE(
        NULLIF(it->>'appliedQuantity', '')::numeric,
        NULLIF(it->>'quantity',        '')::numeric,
        0
    ),
    CASE o.type
        WHEN 'receipt'    THEN  COALESCE(NULLIF(it->>'appliedQuantity','')::numeric, NULLIF(it->>'quantity','')::numeric, 0)
        WHEN 'shipment'   THEN -COALESCE(NULLIF(it->>'appliedQuantity','')::numeric, NULLIF(it->>'quantity','')::numeric, 0)
        WHEN 'writeoff'   THEN -COALESCE(NULLIF(it->>'quantity',       '')::numeric, 0)
        WHEN 'correction' THEN  COALESCE(NULLIF(it->>'delta',          '')::numeric, 0)
        ELSE 0
    END,
    (SELECT r.id FROM writeoff_reasons r WHERE r.code = (it->>'reason'))         AS writeoff_reason_id,
    it->>'reason'                                                                  AS writeoff_reason_text,
    COALESCE(it->>'productName', p.name, 'Unknown'),
    COALESCE(it->>'productSKU',  p.sku,  ''),
    it->>'note'
FROM operations o
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS it
LEFT JOIN products p ON p.id = NULLIF(it->>'productId', '')::bigint
WHERE o.type IN ('receipt', 'shipment', 'writeoff', 'correction')
  AND NULLIF(it->>'productId', '') IS NOT NULL;

-- inventory: differences → operation_inventory_diffs
INSERT INTO operation_inventory_diffs (
    operation_id, product_id, expected, actual,
    product_name_snapshot, product_sku_snapshot
)
SELECT
    o.id,
    NULLIF(d->>'productId', '')::bigint,
    COALESCE(NULLIF(d->>'expected', '')::numeric, 0),
    COALESCE(NULLIF(d->>'actual',   '')::numeric, 0),
    COALESCE(d->>'productName', p.name, 'Unknown'),
    COALESCE(d->>'sku', d->>'productSKU', p.sku, '')
FROM operations o
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.differences, '[]'::jsonb)) AS d
LEFT JOIN products p ON p.id = NULLIF(d->>'productId', '')::bigint
WHERE o.type = 'inventory'
  AND NULLIF(d->>'productId', '') IS NOT NULL;
