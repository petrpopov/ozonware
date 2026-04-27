import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';
import { useRouteRefetch } from '../hooks/useRouteRefetch.js';
import { useUiStore } from '../store/useUiStore.js';
import { TrashIcon } from '../components/Icons.jsx';
import Modal from '../components/Modal.jsx';
import { FIELD_NAME_OZON_PHOTO } from '../constants/fieldKinds.js';

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function getBarcodeValues(product) {
  const fields = product.custom_fields || [];
  return fields
    .filter((field) => {
      const name = normalize(field.name);
      return name === 'штрихкод' || name === 'ozon' || field.type === 'barcode';
    })
    .map((field) => String(field.value ?? '').trim())
    .filter(Boolean);
}

function getInventoryNote(note, boxesCount, positionsCount) {
  if (note.trim()) {
    return note.trim();
  }
  return `Инвентаризация: ${boxesCount} коробов, ${positionsCount} позиций`;
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryStep, setInventoryStep] = useState(1);
  const [scanQuery, setScanQuery] = useState('');
  const [inventoryDate, setInventoryDate] = useState(new Date().toISOString().slice(0, 10));
  const [inventoryNote, setInventoryNote] = useState('');
  const [currentBox, setCurrentBox] = useState({});
  const [boxes, setBoxes] = useState([]);
  const [reviewRows, setReviewRows] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [historySort, setHistorySort] = useState({ key: 'date', dir: 'desc' });
  const [invPage, setInvPage] = useState(1);
  const [invLimit, setInvLimit] = useState('20');

  const invSortKeyMap = { id: 'id', date: 'operationDate', diffs: 'totalQuantity', note: 'note' };
  const invSortParam = `${invSortKeyMap[historySort.key] || 'operationDate'},${historySort.dir}`;
  const invPageIdx = invPage - 1;
  const invSize = invLimit === 'all' ? 9999 : Number(invLimit);
  const invOffset = invPageIdx * (invLimit === 'all' ? 0 : Number(invLimit));

  const productsQuery = useQuery({ queryKey: ['products', 'inventory'], queryFn: () => services.getProducts('') });
  const historyQuery = useQuery({
    queryKey: ['operations', 'inventory', invLimit, invPage, historySort],
    queryFn: () => services.getOperations({ filter: 'typeCode==inventory', page: invPageIdx, size: invSize, sort: invSortParam })
  });
  const historyDetailsQuery = useQuery({
    queryKey: ['operation', selectedHistoryId],
    queryFn: () => services.getOperationById(selectedHistoryId),
    enabled: selectedHistoryId !== null
  });

  useRouteRefetch(productsQuery.refetch);
  useRouteRefetch(historyQuery.refetch);

  const products = productsQuery.data || [];
  const getPhoto = (product) => {
    const field = (product?.custom_fields || []).find((f) => String(f.name || '').trim() === FIELD_NAME_OZON_PHOTO);
    return String(field?.value || '').trim();
  };

  const createMutation = useMutation({
    mutationFn: services.createOperation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setInventoryOpen(false);
      setScanQuery('');
      setCurrentBox({});
      setBoxes([]);
      setInventoryNote('');
      setInventoryStep(1);
      setReviewRows([]);
      setReviewError('');
      pushToast('Инвентаризация проведена', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

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
    const query = normalize(scanQuery);
    if (!query) {
      return [];
    }
    return indexedProducts
      .filter((item) => {
        if (normalize(item.sku).includes(query)) return true;
        if (normalize(item.name).includes(query)) return true;
        return item.barcodeValues.some((value) => normalize(value).includes(query));
      })
      .slice(0, 10);
  }, [indexedProducts, scanQuery]);

  const addToCurrentBox = (product, step = 1) => {
    setCurrentBox((prev) => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          product,
          count: Math.max(1, Number(existing?.count || 0) + step)
        }
      };
    });
  };

  const decrementItem = (productId) => {
    setCurrentBox((prev) => {
      const item = prev[productId];
      if (!item) return prev;
      if (item.count <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: { ...item, count: item.count - 1 } };
    });
  };

  const removeFromCurrentBox = (productId) => {
    setCurrentBox((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const completeCurrentBox = () => {
    const items = Object.values(currentBox);
    if (items.length === 0) {
      pushToast('Текущий короб пуст', 'error');
      return;
    }
    setBoxes((prev) => [
      ...prev,
      {
        boxNumber: prev.length + 1,
        createdAt: new Date().toISOString(),
        items: items.map((item) => ({ product: item.product, count: item.count }))
      }
    ]);
    setCurrentBox({});
    pushToast('Короб завершен. Начат новый.', 'success');
  };

  const removeBox = (boxNumber) => {
    setBoxes((prev) => prev.filter((box) => box.boxNumber !== boxNumber));
  };

  const totalByProduct = useMemo(() => {
    const map = {};
    boxes.forEach((box) => {
      box.items.forEach((item) => {
        const id = item.product.id;
        map[id] = {
          product: item.product,
          actual: Number(map[id]?.actual || 0) + Number(item.count || 0)
        };
      });
    });
    Object.values(currentBox).forEach((item) => {
      const id = item.product.id;
      map[id] = {
        product: item.product,
        actual: Number(map[id]?.actual || 0) + Number(item.count || 0)
      };
    });
    return map;
  }, [boxes, currentBox]);

  const inventoryStats = useMemo(() => {
    const currentItems = Object.values(currentBox);
    const currentUnits = currentItems.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const completedUnits = boxes.reduce(
      (sum, box) => sum + box.items.reduce((s, item) => s + Number(item.count || 0), 0),
      0
    );
    const positions = Object.keys(totalByProduct).length;
    const differences = Object.values(totalByProduct).filter((item) => Number(item.actual || 0) !== Number(item.product.quantity || 0)).length;
    return {
      boxes: boxes.length,
      currentItems: currentItems.length,
      currentUnits,
      completedUnits,
      totalUnits: currentUnits + completedUnits,
      positions,
      differences
    };
  }, [boxes, currentBox, totalByProduct]);

  const historyData = historyQuery.data?.items || [];
  const historyTotal = Number(historyQuery.data?.total || 0);
  const invTotalPages = invLimit === 'all' ? 1 : Math.max(1, Math.ceil(historyTotal / Math.max(1, Number(invLimit))));
  const invRangeStart = historyTotal === 0 ? 0 : invOffset + 1;
  const invRangeEnd = historyTotal === 0 ? 0 : Math.min(invOffset + historyData.length, historyTotal);

  const processScannerSubmit = () => {
    const raw = scanQuery.trim();
    if (!raw) return;

    const query = normalize(raw);

    const exactBarcode = indexedProducts.find((item) => item.barcodeValues.some((value) => normalize(value) === query));
    const exactSku = indexedProducts.find((item) => normalize(item.sku) === query);
    const exactName = indexedProducts.find((item) => normalize(item.name) === query);

    const exact = exactBarcode || exactSku || exactName;
    if (exact) {
      addToCurrentBox(exact.product, 1);
      setScanQuery('');
      return;
    }

    if (filteredProducts.length === 1) {
      addToCurrentBox(filteredProducts[0].product, 1);
      setScanQuery('');
      return;
    }

    pushToast(`Товар не найден: ${raw}`, 'error');
  };

  const applyInventory = () => {
    if (reviewRows.length === 0) {
      pushToast('Нет отсканированных товаров', 'error');
      return;
    }

    const differences = reviewRows
      .filter((row) => row.difference !== 0)
      .map((row) => ({
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        expected: row.expected,
        actual: row.actual,
        difference: row.difference
      }));

    createMutation.mutate({
      type: 'inventory',
      operation_date: inventoryDate,
      note: getInventoryNote(inventoryNote, boxes.length + (Object.keys(currentBox).length > 0 ? 1 : 0), reviewRows.length),
      total_quantity: differences.length,
      differences
    });
  };

  const openReviewStep = async () => {
    const scanned = Object.values(totalByProduct);
    if (scanned.length === 0) {
      pushToast('Нет отсканированных товаров', 'error');
      return;
    }

    setReviewLoading(true);
    setReviewError('');
    try {
      const freshProducts = await services.getProducts('');
      const serverById = new Map(freshProducts.map((product) => [product.id, product]));

      const rows = scanned
        .map((item) => {
          const serverProduct = serverById.get(item.product.id);
          const expected = Number(serverProduct?.quantity ?? item.product.quantity ?? 0);
          const actual = Number(item.actual || 0);
          return {
            productId: item.product.id,
            sku: item.product.sku,
            name: item.product.name,
            photo: getPhoto(serverProduct || item.product),
            expected,
            actual,
            difference: actual - expected
          };
        })
        .sort((left, right) => String(left.sku).localeCompare(String(right.sku), 'ru', { sensitivity: 'base' }));

      setReviewRows(rows);
      setInventoryStep(2);
    } catch (error) {
      setReviewError(error.message || 'Не удалось получить актуальные остатки с сервера');
    } finally {
      setReviewLoading(false);
    }
  };

  const startInventory = () => {
    setInventoryOpen(true);
    setInventoryStep(1);
    setScanQuery('');
    setCurrentBox({});
    setBoxes([]);
    setInventoryNote('');
    setInventoryDate(new Date().toISOString().slice(0, 10));
    setReviewRows([]);
    setReviewError('');
  };


  if (productsQuery.isLoading || historyQuery.isLoading) return <p>Загрузка...</p>;

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-title-cluster">
          <h1 className="page-title">Инвентаризация</h1>
          <div className="page-subtitle">Сверка и пересчёт остатков на складе</div>
        </div>
      </div>
      <div className="toolbar operation-actions">
        <button className="btn btn-primary operation-action-btn" type="button" onClick={startInventory}>
          + Начать
        </button>
      </div>

      <section className="card">
        <h3>Последние инвентаризации</h3>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th className="sortable" onClick={() => { setInvPage(1); setHistorySort((p) => (p.key === 'id' ? { key: 'id', dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key: 'id', dir: 'asc' })); }}>
                  ID <span>{historySort.key === 'id' ? (historySort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                </th>
                <th className="sortable" onClick={() => { setInvPage(1); setHistorySort((p) => (p.key === 'date' ? { key: 'date', dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key: 'date', dir: 'asc' })); }}>
                  Дата <span>{historySort.key === 'date' ? (historySort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                </th>
                <th className="sortable" onClick={() => { setInvPage(1); setHistorySort((p) => (p.key === 'diffs' ? { key: 'diffs', dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key: 'diffs', dir: 'asc' })); }}>
                  Расхождений <span>{historySort.key === 'diffs' ? (historySort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                </th>
                <th className="sortable" onClick={() => { setInvPage(1); setHistorySort((p) => (p.key === 'note' ? { key: 'note', dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key: 'note', dir: 'asc' })); }}>
                  Примечание <span>{historySort.key === 'note' ? (historySort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {historyData.map((op) => (
                <tr key={op.id} className="row-clickable" onClick={() => setSelectedHistoryId(op.id)}>
                  <td>{op.id}</td>
                  <td>{(op.operation_date || '').slice(0, 10)}</td>
                  <td>{op.differences?.length || 0}</td>
                  <td>
                    <span className="cell-ellipsis" title={op.note || '—'}>{op.note || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <label className="pagination-label">
            Показывать
            <select className="select-sm" value={invLimit} onChange={(e) => { setInvPage(1); setInvLimit(e.target.value); }}>
              {['10', '20', '50', '100', 'all'].map((v) => <option key={v} value={v}>{v === 'all' ? 'Все' : v}</option>)}
            </select>
          </label>
          {historyTotal > 0 && (
            <span className="pagination-range">{invRangeStart}–{invRangeEnd} из {historyTotal}</span>
          )}
          <div className="pagination-controls">
            <button className="btn btn-sm" disabled={invPage <= 1} onClick={() => setInvPage((p) => p - 1)}>Назад</button>
            <button className="btn btn-sm" disabled={invPage >= invTotalPages} onClick={() => setInvPage((p) => p + 1)}>Вперед</button>
          </div>
        </div>
      </section>

      <Modal
        open={selectedHistoryId !== null}
        onClose={() => setSelectedHistoryId(null)}
        title={`Инвентаризация #${historyDetailsQuery.data?.id || selectedHistoryId || ''}`}
        size="md"
        footer={
          <button className="btn-cancel" type="button" onClick={() => setSelectedHistoryId(null)}>
            Закрыть
          </button>
        }
      >
        {historyDetailsQuery.isLoading && <p>Загрузка...</p>}
        {!historyDetailsQuery.isLoading && (
          <>
                <div className="import-result">
                  Дата: <strong>{(historyDetailsQuery.data?.operation_date || '').slice(0, 10) || '—'}</strong> ·
                  Расхождений: <strong>{historyDetailsQuery.data?.differences?.length || 0}</strong>
                </div>
                <div className="import-result">
                  Примечание: <strong>{historyDetailsQuery.data?.note || '—'}</strong>
                </div>
                <div className="table-wrap receipt-import-preview">
                  <table className="table compact table-compact">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Фото</th>
                        <th>SKU</th>
                        <th>Товар</th>
                        <th>Система</th>
                        <th>Факт</th>
                        <th>Разница</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(historyDetailsQuery.data?.differences || []).length === 0 && (
                        <tr>
                          <td colSpan={7} className="empty-row">Расхождений нет</td>
                        </tr>
                      )}
                      {(historyDetailsQuery.data?.differences || []).map((row, index) => (
                        <tr key={`${row.productId || row.sku || index}`}>
                          <td>{row.productId ?? '—'}</td>
                          <td>
                            {(() => {
                              const product = products.find((p) => Number(p.id) === Number(row.productId));
                              const photo = getPhoto(product);
                              return photo ? (
                                <img className="product-mini-image" src={photo} alt={row.name || row.sku || 'product'} loading="lazy" />
                              ) : (
                                '—'
                              );
                            })()}
                          </td>
                          <td>{row.sku || '—'}</td>
                          <td><span className="cell-ellipsis" title={row.name || '—'}>{row.name || '—'}</span></td>
                          <td>{row.expected ?? '—'}</td>
                          <td>{row.actual ?? '—'}</td>
                          <td>
                            <span
                              className={
                                Number(row.difference || 0) > 0
                                  ? 'diff-badge diff-plus'
                                  : Number(row.difference || 0) < 0
                                    ? 'diff-badge diff-minus'
                                    : 'diff-badge diff-zero'
                              }
                            >
                              {Number(row.difference || 0) > 0
                                ? `+${Number(row.difference || 0)}`
                                : Number(row.difference || 0)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          </>
        )}
      </Modal>

      <Modal
        open={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        title="Инвентаризация по коробам"
        size="xl"
        footer={
          <>
            <button className="btn-cancel" type="button" onClick={() => setInventoryOpen(false)}>
              Закрыть
            </button>
            {inventoryStep === 1 && (
              <button
                className="btn btn-primary"
                type="button"
                onClick={openReviewStep}
                disabled={reviewLoading || inventoryStats.positions === 0}
              >
                {reviewLoading ? 'Загрузка...' : 'Далее: проверка'}
              </button>
            )}
            {inventoryStep === 2 && (
              <>
                <button className="btn" type="button" onClick={() => setInventoryStep(1)}>
                  Назад к сканированию
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={applyInventory}
                  disabled={createMutation.isPending || reviewRows.length === 0}
                >
                  {createMutation.isPending ? 'Проведение...' : 'Провести инвентаризацию'}
                </button>
              </>
            )}
          </>
        }
      >
            <div className="inventory-stepper">
              <div className={`inventory-step ${inventoryStep === 1 ? 'active' : 'done'}`}>
                <span className="inventory-step-num">1</span>
                <span className="inventory-step-label">Сканирование</span>
              </div>
              <div className="inventory-step-arrow">→</div>
              <div className={`inventory-step ${inventoryStep === 2 ? 'active' : ''}`}>
                <span className="inventory-step-num">2</span>
                <span className="inventory-step-label">Проверка</span>
              </div>
            </div>

            {inventoryStep === 1 && (
              <>
                <div className="form-row two-cols">
                  <label>
                    Дата
                    <input
                      className="input"
                      type="date"
                      value={inventoryDate}
                      onChange={(event) => setInventoryDate(event.target.value)}
                    />
                  </label>
                  <label>
                    Примечание
                    <input
                      className="input"
                      value={inventoryNote}
                      onChange={(event) => setInventoryNote(event.target.value)}
                      placeholder="Комментарий к инвентаризации"
                    />
                  </label>
                </div>

                <label>
                  Поиск / скан
                  <input
                    className="input"
                    value={scanQuery}
                    onChange={(event) => setScanQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        processScannerSubmit();
                      }
                    }}
                    placeholder="SKU, название, Штрихкод или OZON"
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
                          addToCurrentBox(item.product, 1);
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
                  Коробов: <strong>{inventoryStats.boxes}</strong> ·
                  Текущий короб: <strong>{inventoryStats.currentItems} поз. / {inventoryStats.currentUnits} шт.</strong> ·
                  Всего: <strong>{inventoryStats.positions} поз. / {inventoryStats.totalUnits} шт.</strong> ·
                  Расхождений: <strong>{inventoryStats.differences}</strong>
                </div>

                <div className="inventory-layout">
                  <section className="field-card">
                    <div className="inventory-box-head">
                      <h4>Текущий короб</h4>
                      <button className="btn" type="button" onClick={completeCurrentBox}>
                        Закончить короб
                      </button>
                    </div>
                    <div className="table-wrap inventory-box-table">
                      <table className="table compact table-compact">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Фото</th>
                            <th>Товар</th>
                            <th>SKU</th>
                            <th>Кол-во</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(currentBox).length === 0 && (
                            <tr>
                              <td colSpan={6} className="empty-row">Короб пуст. Добавьте товары.</td>
                            </tr>
                          )}
                          {Object.values(currentBox).map((item) => (
                            <tr key={item.product.id}>
                              <td>{item.product.id}</td>
                              <td>
                                {getPhoto(item.product) ? (
                                  <img className="product-mini-image" src={getPhoto(item.product)} alt={item.product.name} loading="lazy" />
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td><span className="cell-ellipsis" title={item.product.name}>{item.product.name}</span></td>
                              <td>{item.product.sku}</td>
                              <td>
                                <div className="qty-control">
                                  <button className="btn qty-step" type="button" onClick={() => decrementItem(item.product.id)}>−</button>
                                  <input className="input" type="number" value={item.count} readOnly />
                                  <button className="btn qty-step" type="button" onClick={() => addToCurrentBox(item.product, 1)}>+</button>
                                </div>
                              </td>
                              <td className="row-actions">
                                <button
                                  className="icon-btn danger"
                                  type="button"
                                  aria-label="Удалить"
                                  title="Удалить"
                                  onClick={() => removeFromCurrentBox(item.product.id)}
                                >
                                  <TrashIcon />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="field-card">
                    <h4>Готовые коробы</h4>
                    <div className="inventory-boxes-list">
                      {boxes.length === 0 && <p className="import-subtitle">Пока нет завершенных коробов.</p>}
                      {boxes.map((box) => {
                        const units = box.items.reduce((sum, item) => sum + Number(item.count || 0), 0);
                        return (
                          <div key={box.boxNumber} className="inventory-box-card">
                            <div className="inventory-box-head">
                              <strong>Короб #{box.boxNumber}</strong>
                              <div className="row-actions">
                                <span className="import-subtitle">{box.items.length} поз. · {units} шт.</span>
                                <button
                                  className="icon-btn danger"
                                  type="button"
                                  aria-label="Удалить короб"
                                  title="Удалить короб"
                                  onClick={() => removeBox(box.boxNumber)}
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            </div>
                            <div className="table-wrap">
                              <table className="table compact table-compact">
                                <thead>
                                  <tr>
                                    <th>ID</th>
                                    <th>Фото</th>
                                    <th>Товар</th>
                                    <th>SKU</th>
                                    <th>Кол-во</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {box.items.map((item) => (
                                    <tr key={`${box.boxNumber}-${item.product.id}`}>
                                      <td>{item.product.id}</td>
                                      <td>
                                        {getPhoto(item.product) ? (
                                          <img className="product-mini-image" src={getPhoto(item.product)} alt={item.product.name} loading="lazy" />
                                        ) : (
                                          '—'
                                        )}
                                      </td>
                                      <td><span className="cell-ellipsis" title={item.product.name}>{item.product.name}</span></td>
                                      <td>{item.product.sku}</td>
                                      <td>{item.count}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </>
            )}

            {inventoryStep === 2 && (
              <div className="stack-sm">
                <div className="import-result">
                  Позиции: <strong>{reviewRows.length}</strong> ·
                  Расхождения: <strong>{reviewRows.filter((row) => row.difference !== 0).length}</strong>
                </div>
                <div className="table-wrap receipt-import-preview">
                  <table className="table compact table-compact">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Фото</th>
                        <th>SKU</th>
                        <th>Товар</th>
                        <th>Система (сервер)</th>
                        <th>Факт (коробы)</th>
                        <th>Разница</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewRows.map((row) => (
                        <tr key={row.productId}>
                          <td>{row.productId}</td>
                          <td>
                            {row.photo ? (
                              <img className="product-mini-image" src={row.photo} alt={row.name} loading="lazy" />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{row.sku}</td>
                          <td><span className="cell-ellipsis" title={row.name}>{row.name}</span></td>
                          <td>{row.expected}</td>
                          <td>{row.actual}</td>
                          <td>
                            <span
                              className={
                                row.difference > 0
                                  ? 'diff-badge diff-plus'
                                  : row.difference < 0
                                    ? 'diff-badge diff-minus'
                                    : 'diff-badge diff-zero'
                              }
                            >
                              {row.difference > 0 ? `+${row.difference}` : row.difference}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {reviewError && <div className="import-error">{reviewError}</div>}
              </div>
            )}

      </Modal>
    </div>
  );
}
