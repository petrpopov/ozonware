import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { services } from '../api/services.js';
import { useRouteRefetch } from '../hooks/useRouteRefetch.js';
import { useUiStore } from '../store/useUiStore.js';
import OperationBuilder from '../components/OperationBuilder.jsx';
import ReceiptBoxWizard from '../components/ReceiptBoxWizard.jsx';
import OperationsHistory from '../components/OperationsHistory.jsx';
import Modal from '../components/Modal.jsx';
import { FIELD_NAME_OZON_PHOTO } from '../constants/fieldKinds.js';

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeSheetRows(rawRows) {
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

function findSkuColumnIndex(headers) {
  const exact = headers.findIndex((header) => normalizeText(header) === 'sku');
  if (exact >= 0) {
    return exact;
  }
  return headers.findIndex((header) => normalizeText(header).includes('sku'));
}

function findQuantityColumnIndex(headers) {
  const aliases = ['количество', 'qty', 'quantity', 'count'];
  return headers.findIndex((header) => aliases.some((alias) => normalizeText(header).includes(alias)));
}

function parseIntegerQuantity(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(/\s+/g, '').replace(',', '.');
  if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  const qty = Number(normalized);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    return null;
  }
  return qty;
}

let xlsxModulePromise = null;
async function loadXlsx() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx');
  }
  return xlsxModulePromise;
}

export default function ReceiptPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const navigate = useNavigate();
  const [historyLimit, setHistoryLimit] = useState('20');
  const [historyPage, setHistoryPage] = useState(1);
  const [importFileName, setImportFileName] = useState('');
  const [importSheets, setImportSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [importHeaders, setImportHeaders] = useState([]);
  const [importRows, setImportRows] = useState([]);
  const [quantityColumn, setQuantityColumn] = useState('');
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [importError, setImportError] = useState('');
  const [importPlanId, setImportPlanId] = useState(null);
  const [availablePlansForImport, setAvailablePlansForImport] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [receiptMode, setReceiptMode] = useState('normal');
  const [editOpen, setEditOpen] = useState(false);
  const [historySort, setHistorySort] = useState({ key: 'date', dir: 'desc' });
  const [editForm, setEditForm] = useState({ id: null, operation_date: '', note: '', items: [], plannedSupplyId: null, corrections: [] });

  const resetImportState = () => {
    setImportFileName('');
    setImportSheets([]);
    setSelectedSheet('');
    setImportHeaders([]);
    setImportRows([]);
    setQuantityColumn('');
    setImportDate(new Date().toISOString().slice(0, 10));
    setImportError('');
    setImportPlanId(null);
    setAvailablePlansForImport([]);
  };

  const openImportModal = () => {
    resetImportState();
    setImportOpen(true);
    services.getPlannedSupplies({ includeClosed: false }).then((res) => {
      setAvailablePlansForImport(Array.isArray(res) ? res : (res?.items || []));
    }).catch(() => {});
  };

  const closeImportModal = () => {
    setImportOpen(false);
    resetImportState();
  };

  const productsQuery = useQuery({ queryKey: ['products', 'receipt'], queryFn: () => services.getProducts('') });
  const boxSizeQuery = useQuery({
    queryKey: ['app-setting', 'receipt_default_box_size'],
    queryFn: () => services.getAppSetting('receipt_default_box_size'),
    staleTime: 60_000
  });
  const globalBoxSize = parseInt(boxSizeQuery.data?.value, 10) || 10;

  const receiptSortKeyMap = { id: 'id', date: 'operationDate', items: 'id', total: 'totalQuantity', note: 'note' };
  const operationsSort = `${receiptSortKeyMap[historySort.key] || 'operationDate'},${historySort.dir}`;
  const operationsPage = historyPage - 1;
  const operationsSize = historyLimit === 'all' ? 9999 : Number(historyLimit);
  const operationsOffset = operationsPage * (historyLimit === 'all' ? 0 : Number(historyLimit));

  const operationsQuery = useQuery({
    queryKey: ['operations', 'receipt', historyLimit, historyPage, historySort],
    queryFn: () =>
      services.getOperations({
        filter: 'typeCode==receipt;parentOperationId=isnull=true',
        page: operationsPage,
        size: operationsSize,
        sort: operationsSort
      })
  });

  useRouteRefetch(productsQuery.refetch);
  useRouteRefetch(operationsQuery.refetch);

  const operationsData = operationsQuery.data?.items || [];
  const operationsTotal = Number(operationsQuery.data?.total || 0);
  const effectiveLimit = historyLimit === 'all' ? operationsTotal || operationsData.length : Number(historyLimit);
  const totalPages =
    historyLimit === 'all' ? 1 : Math.max(1, Math.ceil(operationsTotal / Math.max(1, effectiveLimit)));
  const rangeStart = operationsTotal === 0 ? 0 : operationsOffset + 1;
  const rangeEnd = operationsTotal === 0 ? 0 : Math.min(operationsOffset + operationsData.length, operationsTotal);

  const createMutation = useMutation({
    mutationFn: services.createOperation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'receipt'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast('Приход проведен', 'success');
      setAddOpen(false);
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: services.deleteOperation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'receipt'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast('Операция удалена', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => services.updateOperation(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'receipt'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setEditOpen(false);
      pushToast('Приход обновлен', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const openEditModal = async (operation) => {
    try {
      const full = await services.getOperationById(operation.id);
      const items = (full.items || []).map((item, index) => ({
        key: `${item.productId || item.productSKU || index}`,
        productId: item.productId,
        productName: item.productName || item.name || '',
        productSKU: item.productSKU || item.sku || '',
        productImage: (() => {
          const product = (productsQuery.data || []).find((p) => Number(p.id) === Number(item.productId));
          const field = (product?.custom_fields || []).find((f) => String(f.name || '').trim() === FIELD_NAME_OZON_PHOTO);
          return String(field?.value || '').trim();
        })(),
        quantity: Math.max(1, Number(item.quantity || 1))
      }));
      setEditForm({
        id: full.id,
        operation_date: (full.operation_date || '').slice(0, 10),
        note: full.note || '',
        items,
        plannedSupplyId: full.planned_supply_id || null,
        corrections: full.corrections || []
      });
      setEditOpen(true);
    } catch (error) {
      pushToast(error.message || 'Не удалось загрузить операцию', 'error');
    }
  };

  const updateEditItemQty = (productId, quantity) => {
    const nextQty = Math.max(1, Number(quantity || 1));
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.productId === productId ? { ...item, quantity: nextQty } : item))
    }));
  };

  const saveEditOperation = () => {
    if (!editForm.id) return;
    const total_quantity = editForm.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    updateMutation.mutate({
      id: editForm.id,
      payload: {
        operation_date: editForm.operation_date,
        note: editForm.note,
        items: editForm.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          productSKU: item.productSKU,
          quantity: Math.max(1, Number(item.quantity || 1))
        })),
        total_quantity
      }
    });
  };

  const applySheet = (sheetName, sheets = importSheets) => {
    const nextSheet = sheets.find((item) => item.name === sheetName);
    if (!nextSheet) {
      return;
    }
    setSelectedSheet(nextSheet.name);
    setImportHeaders(nextSheet.headers);
    setImportRows(nextSheet.rows);
    const detectedQty = findQuantityColumnIndex(nextSheet.headers);
    setQuantityColumn(detectedQty >= 0 ? String(detectedQty) : '');
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    if (!/\.xlsx?$/.test(file.name.toLowerCase())) {
      setImportError('Поддерживаются только .xlsx и .xls файлы');
      return;
    }

    try {
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheets = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        const normalized = normalizeSheetRows(rawRows);
        return {
          name: sheetName,
          headers: normalized.headers,
          rows: normalized.rows
        };
      });

      const sheetWithData = sheets.find((item) => item.headers.length > 0) || sheets[0];

      setImportFileName(file.name);
      setImportSheets(sheets);
      setImportError('');

      if (!sheetWithData || sheetWithData.headers.length === 0) {
        setSelectedSheet('');
        setImportHeaders([]);
        setImportRows([]);
        setQuantityColumn('');
        setImportError('В файле не найдены данные');
        return;
      }

      applySheet(sheetWithData.name, sheets);
    } catch (error) {
      setImportError(error.message || 'Не удалось прочитать файл');
    }
  };

  const skuColumnIndex = useMemo(() => findSkuColumnIndex(importHeaders), [importHeaders]);

  const importPreview = useMemo(() => {
    const quantityColumnIndex = Number(quantityColumn);
    if (
      skuColumnIndex < 0 ||
      !Number.isInteger(quantityColumnIndex) ||
      quantityColumnIndex < 0 ||
      importRows.length === 0
    ) {
      return {
        entries: [],
        foundEntries: [],
        totals: {
          rowsInFile: importRows.length,
          uniqueSku: 0,
          foundSku: 0,
          notFoundSku: 0,
          totalQtyInFile: 0,
          totalQtyFound: 0,
          skippedEmptySku: 0,
          skippedInvalidQty: 0
        }
      };
    }

    const productsMap = new Map(
      (productsQuery.data || []).map((product) => [normalizeText(product.sku), product])
    );
    const grouped = new Map();
    let skippedEmptySku = 0;
    let skippedInvalidQty = 0;

    importRows.forEach((row) => {
      const skuValue = String(row?.[skuColumnIndex] ?? '').trim();
      if (!skuValue) {
        skippedEmptySku += 1;
        return;
      }
      const quantity = parseIntegerQuantity(row?.[quantityColumnIndex]);
      if (quantity === null) {
        skippedInvalidQty += 1;
        return;
      }

      const key = normalizeText(skuValue);
      const current = grouped.get(key) || { sku: skuValue, quantity: 0 };
      current.quantity += quantity;
      grouped.set(key, current);
    });

    const entries = Array.from(grouped.values())
      .map((item) => {
        const product = productsMap.get(normalizeText(item.sku)) || null;
        return { ...item, product, found: Boolean(product) };
      })
      .sort((left, right) => String(left.sku).localeCompare(String(right.sku), 'ru', { sensitivity: 'base' }));

    const foundEntries = entries.filter((item) => item.found);
    const totalQtyInFile = entries.reduce((sum, item) => sum + item.quantity, 0);
    const totalQtyFound = foundEntries.reduce((sum, item) => sum + item.quantity, 0);

    return {
      entries,
      foundEntries,
      totals: {
        rowsInFile: importRows.length,
        uniqueSku: entries.length,
        foundSku: foundEntries.length,
        notFoundSku: entries.length - foundEntries.length,
        totalQtyInFile,
        totalQtyFound,
        skippedEmptySku,
        skippedInvalidQty
      }
    };
  }, [importRows, quantityColumn, skuColumnIndex, productsQuery.data]);

  const importMutation = useMutation({
    mutationFn: services.createOperation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'receipt'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast('Приход из Excel проведен', 'success');
      closeImportModal();
    },
    onError: (error) => pushToast(error.message, 'error')
  });


  const submitImportedReceipt = () => {
    if (!importFileName) {
      setImportError('Загрузите Excel файл');
      return;
    }

    if (skuColumnIndex < 0) {
      setImportError('В выбранном листе не найдена колонка SKU');
      return;
    }

    if (!quantityColumn) {
      setImportError('Выберите колонку количества');
      return;
    }

    if (importPreview.foundEntries.length === 0) {
      setImportError('Нет найденных в БД товаров для проведения прихода');
      return;
    }

    const items = importPreview.foundEntries.map((item) => ({
      productId: item.product.id,
      productName: item.product.name,
      productSKU: item.product.sku,
      quantity: item.quantity
    }));
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

    importMutation.mutate({
      type: 'receipt',
      operation_date: importDate,
      note: `Приход от ${importDate} (Excel: ${importFileName})`,
      total_quantity: totalQuantity,
      items,
      planned_supply_id: importPlanId
    });
  };


  if (productsQuery.isLoading || operationsQuery.isLoading) return <p>Загрузка...</p>;

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-title-cluster">
          <h1 className="page-title">Приход</h1>
          <div className="page-subtitle">История оприходования товаров</div>
        </div>
      </div>
      <div className="toolbar operation-actions">
        <button className="btn btn-primary operation-action-btn" type="button" onClick={() => setAddOpen(true)}>
          + Добавить
        </button>
        <button className="btn operation-action-btn" type="button" onClick={openImportModal}>
          Импорт из Excel
        </button>
      </div>
      <div className="toolbar history-pager">
        <label className="history-pager-label">
          Показывать:
          <select
            className="input"
            value={historyLimit}
            onChange={(event) => {
              setHistoryLimit(event.target.value);
              setHistoryPage(1);
            }}
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="200">200</option>
            <option value="all">Все</option>
          </select>
        </label>
        <span className="history-pager-range">
          {rangeStart}-{rangeEnd} из {operationsTotal}
        </span>
        {historyLimit !== 'all' && (
          <>
            <button
              className="btn"
              type="button"
              disabled={historyPage <= 1}
              onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
            >
              Назад
            </button>
            <span className="history-pager-range">
              Стр. {historyPage} / {totalPages}
            </span>
            <button
              className="btn"
              type="button"
              disabled={historyPage >= totalPages}
              onClick={() => setHistoryPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Вперед
            </button>
          </>
        )}
      </div>
      <OperationsHistory
        title="История приходов"
        operations={operationsData}
        onEdit={openEditModal}
        onDelete={(id) => deleteMutation.mutate(id)}
        enableSorting
        sort={historySort}
        onSort={(key) => {
          setHistorySort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
          setHistoryPage(1);
        }}
        emptyMessage="Нет операций приёмки"
        emptySubtext="Создайте первую операцию, чтобы начать учёт поступлений"
      />

      <Modal
        open={addOpen}
        onClose={() => { setAddOpen(false); setReceiptMode('normal'); }}
        title="Новый приход"
        size={receiptMode === 'boxes' ? 'xl' : 'lg'}
        footer={
          <button className="btn-cancel" type="button" onClick={() => { setAddOpen(false); setReceiptMode('normal'); }}>
            Закрыть
          </button>
        }
      >
        <div className="segment-control" style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className={`btn${receiptMode === 'normal' ? ' btn-primary' : ''}`}
            onClick={() => setReceiptMode('normal')}
          >
            Обычный
          </button>
          <button
            type="button"
            className={`btn${receiptMode === 'boxes' ? ' btn-primary' : ''}`}
            onClick={() => setReceiptMode('boxes')}
          >
            По коробкам
          </button>
        </div>
        {receiptMode === 'normal' && (
          <OperationBuilder
            type="receipt"
            products={productsQuery.data || []}
            onSubmit={(payload) => createMutation.mutate(payload)}
            loading={createMutation.isPending}
          />
        )}
        {receiptMode === 'boxes' && (
          <ReceiptBoxWizard
            products={productsQuery.data || []}
            globalBoxSize={globalBoxSize}
            onSubmit={(payload) => createMutation.mutate(payload)}
            loading={createMutation.isPending}
          />
        )}
      </Modal>

      <Modal
        open={importOpen}
        onClose={closeImportModal}
        title="Импорт прихода из Excel"
        size="lg"
        footer={
          <>
            <button className="btn-cancel" type="button" onClick={closeImportModal}>
              Закрыть
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={submitImportedReceipt}
              disabled={importMutation.isPending || importPreview.foundEntries.length === 0}
            >
              {importMutation.isPending ? 'Проведение...' : 'Провести'}
            </button>
          </>
        }
      >
        <p className="import-subtitle">
              SKU берется из колонки <strong>SKU</strong>. Не найденные в БД товары не добавляются.
            </p>

            <div className="form-row two-cols">
              <div className="stack-sm">
                <span>Файл Excel</span>
                <label className="btn import-file-btn">
                  Загрузить файл
                  <input className="hidden-input" type="file" accept=".xlsx,.xls" onChange={handleImportFile} />
                </label>
              </div>
              <label>
                Дата прихода
                <input
                  className="input"
                  type="date"
                  min="2020-01-01"
                  max="2099-12-31"
                  value={importDate}
                  onChange={(event) => setImportDate(event.target.value)}
                />
              </label>
              <label>
                Лист файла
                <select
                  className="input"
                  value={selectedSheet}
                  onChange={(event) => applySheet(event.target.value)}
                  disabled={importSheets.length === 0}
                >
                  <option value="">Выберите лист</option>
                  {importSheets.map((sheet) => (
                    <option key={sheet.name} value={sheet.name}>
                      {sheet.name} ({sheet.rows.length} строк)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Колонка количества
                <select
                  className="input"
                  value={quantityColumn}
                  onChange={(event) => setQuantityColumn(event.target.value)}
                  disabled={importHeaders.length === 0}
                >
                  <option value="">Выберите колонку</option>
                  {importHeaders.map((header, index) => (
                    <option key={`${header}-${index}`} value={String(index)}>
                      {header || `Колонка ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {importFileName && <div className="import-file-name">Файл: {importFileName}</div>}

            {/* Plan linkage */}
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <label className="field-label" style={{ marginBottom: 'var(--space-1)', display: 'block' }}>
                Привязать к плану (необязательно)
              </label>
              <select
                className="input"
                value={importPlanId || ''}
                onChange={(e) => setImportPlanId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Без привязки —</option>
                {availablePlansForImport.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.title} {(plan.expected_date || plan.purchase_date) ? `(${plan.expected_date || plan.purchase_date})` : ''}</option>
                ))}
              </select>
            </div>

            {skuColumnIndex < 0 && importHeaders.length > 0 && (
              <div className="import-error">В выбранном листе не найдена колонка SKU</div>
            )}
            {importError && <div className="import-error">{importError}</div>}

            {importPreview.entries.length > 0 && (
              <div className="stack-sm">
                <div className="import-result">
                  Строк в файле: <strong>{importPreview.totals.rowsInFile}</strong> · SKU в файле:{' '}
                  <strong>{importPreview.totals.uniqueSku}</strong> · Найдено в БД:{' '}
                  <strong>{importPreview.totals.foundSku}</strong> · Не найдено:{' '}
                  <strong>{importPreview.totals.notFoundSku}</strong> · Кол-во в файле:{' '}
                  <strong>{importPreview.totals.totalQtyInFile}</strong> · Кол-во к приходу:{' '}
                  <strong>{importPreview.totals.totalQtyFound}</strong> · Пропущено (пустой SKU):{' '}
                  <strong>{importPreview.totals.skippedEmptySku}</strong> · Пропущено (невалидное количество):{' '}
                  <strong>{importPreview.totals.skippedInvalidQty}</strong>
                </div>
                <div className="table-wrap import-preview-table">
                  <table className="table compact table-compact">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Количество</th>
                        <th>Товар в БД</th>
                        <th>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.entries.map((entry) => (
                        <tr key={entry.sku} className={entry.found ? 'match-found' : 'match-missing'}>
                          <td>{entry.sku}</td>
                          <td>{entry.quantity}</td>
                          <td>{entry.product ? entry.product.name : '—'}</td>
                          <td>
                            <span className={`match-pill ${entry.found ? 'match-pill-found' : 'match-pill-missing'}`}>
                              {entry.found ? 'Найден' : 'Не найден'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Редактирование прихода #${editForm?.id || ''}`}
        size="lg"
        footer={
          <>
            <button className="btn-cancel" type="button" onClick={() => setEditOpen(false)}>
              Закрыть
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={saveEditOperation}
              disabled={updateMutation.isPending || (editForm?.items?.length === 0)}
            >
              {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
          </>
        }
      >

            <div className="form-row two-cols">
              <label>
                Дата
                <input
                  className="input"
                  type="date"
                  min="2020-01-01"
                  max="2099-12-31"
                  value={editForm.operation_date}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, operation_date: event.target.value }))}
                />
              </label>
              <label>
                Примечание
                <input
                  className="input"
                  value={editForm.note}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, note: event.target.value }))}
                />
              </label>
            </div>

            {editForm.plannedSupplyId && (
              <div style={{ marginBottom: 'var(--space-3)', padding: 'var(--space-2)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-muted)' }}>Поставка: </span>
                <a
                  href={`/planned-supplies/${editForm.plannedSupplyId}`}
                  style={{ color: 'var(--color-accent)', textDecoration: 'none', fontSize: '13px' }}
                  onClick={(e) => { e.preventDefault(); navigate(`/planned-supplies/${editForm.plannedSupplyId}`); setEditOpen(false); }}
                >
                  #{editForm.plannedSupplyId} →
                </a>
              </div>
            )}

            <div className="table-wrap receipt-import-preview">
              <table className="table compact table-compact">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Фото</th>
                    <th>SKU</th>
                    <th>Товар</th>
                    <th>Количество</th>
                  </tr>
                </thead>
                <tbody>
                  {editForm.items.map((item) => (
                    <tr key={item.key}>
                      <td>{item.productId}</td>
                      <td>
                        {item.productImage ? (
                          <img className="product-mini-image" src={item.productImage} alt={item.productName} loading="lazy" />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{item.productSKU}</td>
                      <td><span className="cell-ellipsis" title={item.productName}>{item.productName}</span></td>
                      <td>
                        <div className="qty-control">
                          <button className="btn qty-step" type="button" onClick={() => updateEditItemQty(item.productId, item.quantity - 1)}>−</button>
                          <input
                            className="input"
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(event) => updateEditItemQty(item.productId, event.target.value)}
                          />
                          <button className="btn qty-step" type="button" onClick={() => updateEditItemQty(item.productId, item.quantity + 1)}>+</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

      </Modal>

    </div>
  );
}
