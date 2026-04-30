import { useMemo, useRef, useState } from 'react';
import { useUiStore } from '../store/useUiStore.js';
import { TrashIcon } from './Icons.jsx';
import { FIELD_NAME_OZON_PHOTO } from '../constants/fieldKinds.js';
import { services } from '../api/services.js';

// --- helpers ---

function normalizeStr(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getBarcodeValues(product) {
  const fields = product.custom_fields || [];
  return fields
    .filter((f) => {
      const name = normalizeStr(f.name);
      return name === 'штрихкод' || name === 'ozon' || f.type === 'barcode';
    })
    .map((f) => String(f.value ?? '').trim())
    .filter(Boolean);
}

function getPhoto(product) {
  const field = (product?.custom_fields || []).find(
    (f) => String(f.name || '').trim() === FIELD_NAME_OZON_PHOTO
  );
  return String(field?.value || '').trim();
}

// --- xlsx helpers (локальные копии паттерна из ReceiptPage) ---

function normalizeSheetRows(rawRows) {
  const rows = (rawRows || []).map((row) => (Array.isArray(row) ? row : []));
  if (!rows.length) return { headers: [], rows: [] };
  let maxColIndex = -1;
  rows.forEach((row) => row.forEach((cell, idx) => {
    if (String(cell ?? '').trim() !== '' && idx > maxColIndex) maxColIndex = idx;
  }));
  if (maxColIndex < 0) return { headers: [], rows: [] };
  const clipped = rows.map((row) => row.slice(0, maxColIndex + 1));
  const headers = (clipped[0] || []).map((item, idx) => String(item || `Колонка ${idx + 1}`).trim());
  const dataRows = clipped.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  return { headers, rows: dataRows };
}

function findSkuColumnIndex(headers) {
  const exact = headers.findIndex((h) => normalizeStr(h) === 'sku');
  if (exact >= 0) return exact;
  return headers.findIndex((h) => normalizeStr(h).includes('sku'));
}

function findOrderColumnIndex(headers) {
  // ищем колонку «Order» / «Qty» / «Quantity» / «Количество»
  const aliases = ['order', 'qty', 'quantity', 'количество', 'count'];
  return headers.findIndex((h) => aliases.some((a) => normalizeStr(h) === a || normalizeStr(h).includes(a)));
}

let xlsxModulePromise = null;
async function loadXlsx() {
  if (!xlsxModulePromise) xlsxModulePromise = import('xlsx');
  return xlsxModulePromise;
}

// --- компонент ---

/**
 * Режим приёмки товара по коробкам.
 * Шаг 1: сканируем штрихкоды коробок — каждый скан = отдельный односкю-короб.
 * Шаг 2: проверяем агрегат по SKU, корректируем.
 * Шаг 3: сверяем с заказом поставщика (xlsx) или с запланированной поставкой.
 */
export default function ReceiptBoxWizard({ products, globalBoxSize, onSubmit, loading }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const orderFileRef = useRef(null);

  const [step, setStep] = useState(1);
  const [scanQuery, setScanQuery] = useState('');
  // boxes: [{ boxNumber: number, product: object, count: number }]
  const [boxes, setBoxes] = useState([]);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptNote, setReceiptNote] = useState('');
  // шаг 2 — редактируемые итоговые количества по productId
  const [reviewQty, setReviewQty] = useState({});
  // шаг 3 — заказ поставщика
  const [orderFileName, setOrderFileName] = useState('');
  const [orderBySku, setOrderBySku] = useState({}); // sku -> qty (штук)
  // шаг 3 — источник сверки
  const [comparisonSource, setComparisonSource] = useState('none'); // 'none' | 'excel' | 'plan'
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [selectedPlanTitle, setSelectedPlanTitle] = useState('');
  const [plansLoading, setPlansLoading] = useState(false);
  const [availablePlans, setAvailablePlans] = useState([]);

  const boxSize = globalBoxSize ?? 10;

  // --- индекс товаров ---

  const indexedProducts = useMemo(
    () =>
      products.map((product) => ({
        product,
        sku: String(product.sku || ''),
        name: String(product.name || ''),
        barcodeValues: getBarcodeValues(product)
      })),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = normalizeStr(scanQuery);
    if (!query) return [];
    return indexedProducts
      .filter((item) => {
        if (normalizeStr(item.sku).includes(query)) return true;
        if (normalizeStr(item.name).includes(query)) return true;
        return item.barcodeValues.some((v) => normalizeStr(v).includes(query));
      })
      .slice(0, 10);
  }, [indexedProducts, scanQuery]);

  // --- добавление короба ---

  const addBox = (product) => {
    setBoxes((prev) => [
      ...prev,
      { boxNumber: prev.length + 1, product, count: boxSize }
    ]);
  };

  const removeBox = (boxNumber) => {
    setBoxes((prev) => prev.filter((b) => b.boxNumber !== boxNumber));
  };

  const updateBoxCount = (boxNumber, value) => {
    const count = Math.max(1, Number(value) || 1);
    setBoxes((prev) => prev.map((b) => b.boxNumber === boxNumber ? { ...b, count } : b));
  };

  // --- сканер ---

  const processScannerSubmit = () => {
    const raw = scanQuery.trim();
    if (!raw) return;

    const query = normalizeStr(raw);
    const exactBarcode = indexedProducts.find((item) => item.barcodeValues.some((v) => normalizeStr(v) === query));
    const exactSku = indexedProducts.find((item) => normalizeStr(item.sku) === query);
    const exactName = indexedProducts.find((item) => normalizeStr(item.name) === query);
    const exact = exactBarcode || exactSku || exactName;

    if (exact) {
      addBox(exact.product);
      setScanQuery('');
      return;
    }
    if (filteredProducts.length === 1) {
      addBox(filteredProducts[0].product);
      setScanQuery('');
      return;
    }

    pushToast(`Товар не найден: ${raw}`, 'error');
  };

  // --- агрегат по SKU ---

  const totalByProduct = useMemo(() => {
    const map = {};
    boxes.forEach(({ product, count }) => {
      const id = product.id;
      map[id] = { product, total: (map[id]?.total || 0) + count };
    });
    return map;
  }, [boxes]);

  const stats = useMemo(() => ({
    boxes: boxes.length,
    positions: Object.keys(totalByProduct).length,
    totalUnits: boxes.reduce((s, b) => s + b.count, 0)
  }), [boxes, totalByProduct]);

  // --- переход к шагу 2 ---

  const openReview = () => {
    if (Object.keys(totalByProduct).length === 0) {
      pushToast('Нет отсканированных товаров', 'error');
      return;
    }
    const initQty = {};
    Object.values(totalByProduct).forEach(({ product, total }) => {
      initQty[product.id] = total;
    });
    setReviewQty(initQty);
    setStep(2);
  };

  // --- переход к шагу 3 ---

  const openComparison = () => {
    setStep(3);
  };

  // --- загрузка списка запланированных поставок ---

  const loadPlans = async () => {
    setPlansLoading(true);
    try {
      const result = await services.getPlannedSupplies({ includeClosed: false });
      const plans = Array.isArray(result) ? result : (result?.items || []);
      setAvailablePlans(plans);
    } catch {
      pushToast('Не удалось загрузить список поставок', 'error');
    } finally {
      setPlansLoading(false);
    }
  };

  // --- выбор запланированной поставки ---

  const selectPlan = async (plan) => {
    setSelectedPlanId(plan.id);
    setSelectedPlanTitle(plan.title);
    setOrderFileName(plan.title);
    try {
      const full = await services.getPlannedSupplyById(plan.id);
      const bySku = {};
      (full.items || []).forEach((item) => {
        if (item.sku && item.planned_quantity > 0) {
          bySku[item.sku] = (bySku[item.sku] || 0) + item.planned_quantity;
        }
      });
      setOrderBySku(bySku);
    } catch {
      pushToast('Не удалось загрузить позиции поставки', 'error');
    }
  };

  // --- загрузка xlsx заказа поставщика ---

  const handleOrderFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const xlsx = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const wb = xlsx.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
      const { headers, rows } = normalizeSheetRows(rawRows);

      const skuIdx = findSkuColumnIndex(headers);
      const qtyIdx = findOrderColumnIndex(headers);

      if (skuIdx < 0) {
        pushToast('Колонка SKU не найдена в файле', 'error');
        return;
      }
      if (qtyIdx < 0) {
        pushToast('Колонка с количеством не найдена (ожидается: Order, Qty, Quantity)', 'error');
        return;
      }

      const bySku = {};
      rows.forEach((row) => {
        const sku = String(row[skuIdx] ?? '').trim();
        if (!sku) return;
        const raw = String(row[qtyIdx] ?? '').trim();
        const qty = parseInt(raw.replace(/\s+/g, '').replace(',', '.'), 10);
        if (sku && Number.isFinite(qty) && qty > 0) {
          bySku[sku] = (bySku[sku] || 0) + qty;
        }
      });

      if (Object.keys(bySku).length === 0) {
        pushToast('Файл не содержит данных с SKU и количеством', 'error');
        return;
      }

      setOrderFileName(file.name);
      setOrderBySku(bySku);
      pushToast(`Загружено ${Object.keys(bySku).length} позиций из ${file.name}`, 'success');
    } catch (err) {
      console.error(err);
      pushToast('Ошибка при чтении файла', 'error');
    }
  };

  // --- строки сравнения для шага 3 ---

  const comparisonRows = useMemo(() => {
    // актуальные позиции из сканирования (с учётом корректировок шага 2)
    const factBySku = {};
    const productBySku = {};
    Object.values(totalByProduct).forEach(({ product, total }) => {
      const sku = product.sku;
      factBySku[sku] = Number(reviewQty[product.id] ?? total);
      productBySku[sku] = product;
    });

    const allSkus = new Set([...Object.keys(factBySku), ...Object.keys(orderBySku)]);

    // для SKU из заказа, которых не отсканировали — ищем в полном каталоге
    allSkus.forEach((sku) => {
      if (!productBySku[sku]) {
        const found = indexedProducts.find((item) => item.sku === sku);
        if (found) productBySku[sku] = found.product;
      }
    });

    return Array.from(allSkus)
      .sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }))
      .map((sku) => {
        const product = productBySku[sku] || null;
        const factQty = factBySku[sku] ?? 0;
        const orderedQty = orderBySku[sku] ?? 0;
        const factBoxes = factQty > 0 ? Math.ceil(factQty / boxSize) : 0;
        const orderedBoxes = orderedQty > 0 ? Math.ceil(orderedQty / boxSize) : 0;
        const diff = factQty - orderedQty;
        const inFact = sku in factBySku;
        const inOrder = sku in orderBySku;
        return { sku, product, factQty, orderedQty, factBoxes, orderedBoxes, diff, inFact, inOrder };
      });
  }, [totalByProduct, reviewQty, orderBySku, boxSize]);

  const comparisonSummary = useMemo(() => {
    const matched = comparisonRows.filter((r) => r.diff === 0 && r.inFact && r.inOrder).length;
    const total = comparisonRows.length;
    const diffs = comparisonRows.filter((r) => r.diff !== 0 || !r.inFact || !r.inOrder).length;
    return { matched, total, diffs };
  }, [comparisonRows]);

  // --- провести приход ---

  const apply = () => {
    const items = Object.values(totalByProduct).map(({ product }) => ({
      productId: product.id,
      quantity: Number(reviewQty[product.id] ?? 0),
      productName: product.name,
      productSKU: product.sku
    }));
    const total = items.reduce((s, i) => s + i.quantity, 0);
    const noteBase = orderFileName
      ? `Приёмка по коробам: ${stats.boxes} коробок, сверено с ${orderFileName}`
      : `Приёмка по коробам: ${stats.boxes} коробок`;
    onSubmit({
      type: 'receipt',
      operation_date: receiptDate,
      note: receiptNote.trim() || noteBase,
      items,
      total_quantity: total,
      planned_supply_id: selectedPlanId
    });
  };

  // --- diff cell style ---

  function diffStyle(row) {
    if (!row.inOrder) return { color: 'var(--color-danger)' };
    if (!row.inFact) return { color: 'var(--color-warning)' };
    if (row.diff === 0) return { color: 'var(--color-success)' };
    if (row.diff < 0) return { color: 'var(--color-warning)' };
    return { color: 'var(--color-danger)' };
  }

  function rowStyle(row) {
    if (!row.inOrder) return { background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' };
    if (!row.inFact) return { background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)' };
    if (row.diff === 0) return {};
    if (row.diff < 0) return { background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)' };
    return { background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' };
  }

  return (
    <div className="stack">
      {/* Stepper */}
      <div className="inventory-stepper">
        <div className={`inventory-step ${step === 1 ? 'active' : 'done'}`}>
          <span className="inventory-step-num">1</span>
          <span className="inventory-step-label">Сканирование</span>
        </div>
        <div className="inventory-step-arrow">→</div>
        <div className={`inventory-step ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>
          <span className="inventory-step-num">2</span>
          <span className="inventory-step-label">Проверка</span>
        </div>
        <div className="inventory-step-arrow">→</div>
        <div className={`inventory-step ${step === 3 ? 'active' : ''}`}>
          <span className="inventory-step-num">3</span>
          <span className="inventory-step-label">Сверка</span>
        </div>
      </div>

      {/* ── Шаг 1: Сканирование ── */}
      {step === 1 && (
        <>
          <div className="form-row two-cols">
            <label>
              Дата
              <input
                className="input"
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </label>
            <label>
              Примечание
              <input
                className="input"
                value={receiptNote}
                onChange={(e) => setReceiptNote(e.target.value)}
                placeholder="Комментарий к приходу"
              />
            </label>
          </div>

          <label>
            Поиск / скан
            <input
              className="input"
              value={scanQuery}
              onChange={(e) => setScanQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  processScannerSubmit();
                }
              }}
              placeholder="SKU, название или штрихкод — каждый скан = новый короб"
              autoFocus
            />
          </label>

          {filteredProducts.length > 0 && (
            <div className="picker-list">
              {filteredProducts.map((item) => (
                <button
                  key={item.product.id}
                  className="picker-item"
                  type="button"
                  onClick={() => {
                    addBox(item.product);
                    setScanQuery('');
                  }}
                >
                  <span>{item.product.name}</span>
                  <span>{item.product.sku} · остаток {item.product.quantity}</span>
                </button>
              ))}
            </div>
          )}

          <div className="import-result">
            Коробов: <strong>{stats.boxes}</strong> ·
            Позиций: <strong>{stats.positions}</strong> ·
            Единиц: <strong>{stats.totalUnits}</strong>
          </div>

          <section className="field-card">
            <h4>Готовые коробы</h4>
            <div className="inventory-boxes-list">
              {boxes.length === 0 && <p className="import-subtitle">Пока нет коробов. Отсканируйте товар.</p>}
              {boxes.map((box) => (
                <div key={box.boxNumber} className="inventory-box-card" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {getPhoto(box.product) ? (
                    <img className="product-mini-image" src={getPhoto(box.product)} alt={box.product.name} loading="lazy" style={{ flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '32px', height: '32px', flexShrink: 0, background: 'var(--bg-muted)', borderRadius: '4px' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <strong style={{ whiteSpace: 'nowrap' }}>Короб #{box.boxNumber}</strong>
                      <div className="row-actions">
                        <span className="import-subtitle" style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {box.product.sku} ·
                          <input
                            className="input"
                            type="number"
                            min="1"
                            style={{ width: '52px', padding: '1px 6px', height: '24px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}
                            value={box.count}
                            onChange={(e) => updateBoxCount(box.boxNumber, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          шт.
                        </span>
                        <button
                          className="icon-btn danger"
                          type="button"
                          aria-label="Удалить короб"
                          onClick={() => removeBox(box.boxNumber)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                    <span className="import-subtitle" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{box.product.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="modal-footer-inner">
            <button
              className="btn btn-primary"
              type="button"
              onClick={openReview}
              disabled={stats.positions === 0}
            >
              Далее: проверка
            </button>
          </div>
        </>
      )}

      {/* ── Шаг 2: Проверка ── */}
      {step === 2 && (
        <div className="stack-sm">
          <div className="import-result">
            Позиций: <strong>{Object.keys(reviewQty).length}</strong> ·
            Единиц: <strong>{Object.values(reviewQty).reduce((s, v) => s + Number(v || 0), 0)}</strong> ·
            Коробов: <strong>{stats.boxes}</strong>
          </div>
          <div className="table-wrap receipt-import-preview">
            <table className="table compact table-compact">
              <thead>
                <tr>
                  <th style={{ width: '48px' }}>Фото</th>
                  <th style={{ whiteSpace: 'nowrap' }}>SKU</th>
                  <th style={{ width: '100%' }}>Товар</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Коробов</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Кол-во шт.</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(totalByProduct)
                  .sort((a, b) => String(a.product.sku).localeCompare(String(b.product.sku), 'ru', { sensitivity: 'base' }))
                  .map(({ product, total }) => {
                    const qty = Number(reviewQty[product.id] ?? total);
                    const boxCount = qty > 0 ? Math.ceil(qty / boxSize) : 0;
                    return (
                      <tr key={product.id}>
                        <td style={{ width: '48px' }}>
                          {getPhoto(product) ? (
                            <img className="product-mini-image" src={getPhoto(product)} alt={product.name} loading="lazy" />
                          ) : '—'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{product.sku}</td>
                        <td style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={product.name}>{product.name}</td>
                        <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{boxCount}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="qty-control" style={{ display: 'inline-flex', width: 'auto' }}>
                            <button
                              className="btn qty-step"
                              type="button"
                              onClick={() => setReviewQty((prev) => ({ ...prev, [product.id]: Math.max(1, (Number(prev[product.id]) || 0) - 1) }))}
                            >−</button>
                            <input
                              className="input"
                              type="number"
                              min="1"
                              style={{ width: '52px' }}
                              value={reviewQty[product.id] ?? 0}
                              onChange={(e) => setReviewQty((prev) => ({ ...prev, [product.id]: Math.max(0, Number(e.target.value) || 0) }))}
                            />
                            <button
                              className="btn qty-step"
                              type="button"
                              onClick={() => setReviewQty((prev) => ({ ...prev, [product.id]: (Number(prev[product.id]) || 0) + 1 }))}
                            >+</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="modal-footer-inner">
            <button className="btn" type="button" onClick={() => setStep(1)}>
              Назад к сканированию
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={openComparison}
              disabled={Object.keys(reviewQty).length === 0}
            >
              Далее: сверка с заказом
            </button>
          </div>
        </div>
      )}

      {/* ── Шаг 3: Сверка с заказом поставщика ── */}
      {step === 3 && (
        <div className="stack-sm">
          {/* Source selector */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            {[
              { value: 'none', label: 'Без сверки' },
              { value: 'excel', label: 'Excel-файл' },
              { value: 'plan', label: 'Запланированная поставка' },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`btn ${comparisonSource === value ? 'btn-primary' : ''}`}
                onClick={() => {
                  setComparisonSource(value);
                  if (value !== 'excel') { setOrderFileName(''); setOrderBySku({}); setSelectedPlanId(null); }
                  if (value === 'plan') { loadPlans(); }
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {comparisonSource === 'excel' && (
            <div className="field-card" style={{ padding: 'var(--space-3)' }}>
              <p style={{ marginBottom: 'var(--space-2)', fontWeight: 500 }}>
                Загрузите файл заказа поставщика (xlsx) для сверки
              </p>
              <p className="import-subtitle" style={{ marginBottom: 'var(--space-3)' }}>
                Нужны колонки SKU и Order/Qty/Quantity. Количество в файле — в штуках, коробов = ceil(qty / {boxSize}).
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  ref={orderFileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleOrderFile}
                />
                <button
                  className="btn"
                  type="button"
                  onClick={() => orderFileRef.current?.click()}
                >
                  {orderFileName ? `Файл: ${orderFileName}` : 'Выбрать файл заказа'}
                </button>
                {orderFileName && (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => { setOrderFileName(''); setOrderBySku({}); }}
                  >
                    Сбросить
                  </button>
                )}
              </div>
            </div>
          )}

          {comparisonSource === 'plan' && (
            <div className="field-card" style={{ padding: 'var(--space-3)' }}>
              {plansLoading ? (
                <span>Загрузка...</span>
              ) : availablePlans.length === 0 ? (
                <span className="import-subtitle">Нет доступных поставок</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <p style={{ margin: 0, fontWeight: 500 }}>Выберите запланированную поставку:</p>
                  {availablePlans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      className={`btn ${selectedPlanId === plan.id ? 'btn-primary' : ''}`}
                      style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                      onClick={() => selectPlan(plan)}
                    >
                      {plan.title} {plan.purchase_date ? `(${plan.purchase_date})` : ''} — {plan.item_count ?? 0} поз.
                    </button>
                  ))}
                </div>
              )}
              {selectedPlanId && (
                <p style={{ margin: 'var(--space-2) 0 0', fontSize: '12px', color: 'var(--color-success)' }}>
                  ✓ Выбрана поставка: {selectedPlanTitle}
                </p>
              )}
            </div>
          )}

          {Object.keys(orderBySku).length > 0 && (
            <>
              <div className="import-result">
                Позиций совпало: <strong>{comparisonSummary.matched}/{comparisonSummary.total}</strong> ·
                Расхождений: <strong>{comparisonSummary.diffs}</strong>
              </div>
              <div className="table-wrap">
                <table className="table compact table-compact">
                  <thead>
                    <tr>
                      <th style={{ width: '48px' }}>Фото</th>
                      <th>SKU</th>
                      <th style={{ width: '100%' }}>Товар</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Заказ шт.</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Заказ кор.</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Факт шт.</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Факт кор.</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Разница</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.sku} style={rowStyle(row)}>
                        <td>
                          {row.product && getPhoto(row.product) ? (
                            <img className="product-mini-image" src={getPhoto(row.product)} alt={row.product.name} loading="lazy" />
                          ) : '—'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                          {row.sku}
                          {!row.inOrder && (
                            <span style={{ marginLeft: '4px', fontSize: '10px', padding: '1px 5px', borderRadius: '9999px', background: 'color-mix(in srgb, var(--color-danger) 20%, transparent)', color: 'var(--color-danger)' }}>не заказан</span>
                          )}
                          {!row.inFact && (
                            <span style={{ marginLeft: '4px', fontSize: '10px', padding: '1px 5px', borderRadius: '9999px', background: 'color-mix(in srgb, var(--color-warning) 20%, transparent)', color: 'var(--color-warning)' }}>не приехал</span>
                          )}
                        </td>
                        <td style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.product?.name ?? row.sku}>
                          {row.product?.name ?? <span className="import-subtitle">не найден в каталоге</span>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                          {row.orderedQty || '—'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                          {row.orderedBoxes || '—'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                          {row.factQty || '—'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                          {row.factBoxes || '—'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600, ...diffStyle(row) }}>
                          {row.diff > 0 ? `+${row.diff}` : row.diff < 0 ? String(row.diff) : row.inFact && row.inOrder ? '✓' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="modal-footer-inner">
            <button className="btn" type="button" onClick={() => setStep(2)}>
              Назад к проверке
            </button>
            <button
              className="btn"
              type="button"
              onClick={apply}
              disabled={loading || Object.keys(reviewQty).length === 0}
            >
              {loading ? 'Проведение...' : 'Пропустить и провести'}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={apply}
              disabled={loading || Object.keys(reviewQty).length === 0 || Object.keys(orderBySku).length === 0}
            >
              {loading ? 'Проведение...' : 'Провести приход'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
