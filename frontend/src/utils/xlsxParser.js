// Shared xlsx parsing utilities extracted from ReceiptPage and ReceiptBoxWizard

let xlsxModulePromise = null;

/**
 * Lazy-load SheetJS (xlsx) module.
 */
export async function loadXlsx() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx');
  }
  return xlsxModulePromise;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Normalize raw sheet data: skip empty rows, produce headers array and data rows.
 * @param {any[][]} rawRows
 * @returns {{ headers: string[], rows: any[][] }}
 */
export function normalizeSheetRows(rawRows) {
  const rows = (rawRows || []).map((row) => (Array.isArray(row) ? row : []));
  if (!rows.length) {
    return { headers: [], rows: [] };
  }

  let maxColIndex = -1;
  rows.forEach((row) => {
    row.forEach((cell, index) => {
      if (String(cell ?? '').trim() !== '' && index > maxColIndex) {
        maxColIndex = index;
      }
    });
  });

  if (maxColIndex < 0) {
    return { headers: [], rows: [] };
  }

  const clipped = rows.map((row) => row.slice(0, maxColIndex + 1));
  const headerRow = clipped[0] || [];
  const headers = headerRow.map((item, idx) => String(item || `Колонка ${idx + 1}`).trim());
  const dataRows = clipped
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

  return { headers, rows: dataRows };
}

/**
 * Find SKU column index from headers (looks for: sku, артикул, article).
 * @param {string[]} headers
 * @returns {number} index, or -1 if not found
 */
export function findSkuColumnIndex(headers) {
  const exact = headers.findIndex((header) => normalizeText(header) === 'sku');
  if (exact >= 0) {
    return exact;
  }
  return headers.findIndex((header) => normalizeText(header).includes('sku'));
}

/**
 * Find quantity column index for receipt import (Qty, Quantity, Количество, count, кол-во, кол).
 * @param {string[]} headers
 * @returns {number} index, or -1 if not found
 */
export function findQuantityColumnIndex(headers) {
  const aliases = ['количество', 'qty', 'quantity', 'count'];
  return headers.findIndex((header) => aliases.some((alias) => normalizeText(header).includes(alias)));
}

/**
 * Find order/planned quantity column (Order, Qty, Quantity — for supplier comparison).
 * @param {string[]} headers
 * @returns {number} index, or -1 if not found
 */
export function findOrderColumnIndex(headers) {
  const aliases = ['order', 'qty', 'quantity', 'количество', 'count'];
  return headers.findIndex((h) => aliases.some((a) => normalizeText(h) === a || normalizeText(h).includes(a)));
}

/**
 * Parse a supply xlsx file into a list of {sku, qty} items.
 * @param {File} file
 * @param {{ pushToast?: Function }} options
 * @returns {Promise<{ fileName: string, items: Array<{sku: string, qty: number}> } | null>}
 */
export async function parseSupplyXlsx(file, { pushToast } = {}) {
  let xlsx;
  try {
    xlsx = await loadXlsx();
  } catch {
    if (pushToast) pushToast({ kind: 'error', message: 'Не удалось загрузить xlsx-модуль' });
    return null;
  }

  let workbook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = xlsx.read(buffer, { type: 'array' });
  } catch {
    if (pushToast) pushToast({ kind: 'error', message: 'Не удалось прочитать файл' });
    return null;
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    if (pushToast) pushToast({ kind: 'error', message: 'Файл не содержит листов' });
    return null;
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const { headers, rows } = normalizeSheetRows(rawRows);

  if (!headers.length) {
    if (pushToast) pushToast({ kind: 'error', message: 'Не удалось определить заголовки колонок' });
    return null;
  }

  const skuIdx = findSkuColumnIndex(headers);
  if (skuIdx < 0) {
    if (pushToast) pushToast({ kind: 'error', message: 'Не найдена колонка SKU' });
    return null;
  }

  let qtyIdx = findQuantityColumnIndex(headers);
  if (qtyIdx < 0) {
    qtyIdx = findOrderColumnIndex(headers);
  }
  if (qtyIdx < 0) {
    if (pushToast) pushToast({ kind: 'error', message: 'Не найдена колонка количества' });
    return null;
  }

  const items = rows
    .map((row) => {
      const sku = String(row[skuIdx] ?? '').trim();
      const rawQty = String(row[qtyIdx] ?? '').trim();
      if (!sku) return null;
      const normalized = rawQty.replace(/\s+/g, '').replace(',', '.');
      const qty = Number(normalized);
      if (!Number.isFinite(qty) || qty <= 0) return null;
      return { sku, qty };
    })
    .filter(Boolean);

  return { fileName: file.name, items };
}
