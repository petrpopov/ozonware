import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';
import { useRouteRefetch } from '../hooks/useRouteRefetch.js';
import { useUiStore } from '../store/useUiStore.js';
import OperationBuilder from '../components/OperationBuilder.jsx';
import OperationsHistory from '../components/OperationsHistory.jsx';
import Modal from '../components/Modal.jsx';
import { FIELD_NAME_OZON_PHOTO } from '../constants/fieldKinds.js';

export default function WriteoffPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [addOpen, setAddOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionMode, setCorrectionMode] = useState('create');
  const [editingCorrectionId, setEditingCorrectionId] = useState(null);
  const [correctionDate, setCorrectionDate] = useState(new Date().toISOString().slice(0, 10));
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionComment, setCorrectionComment] = useState('');
  const [correctionQuery, setCorrectionQuery] = useState('');
  const [correctionItems, setCorrectionItems] = useState([]);
  const [correctionError, setCorrectionError] = useState('');
  const [writeoffSort, setWriteoffSort] = useState({ key: 'date', dir: 'desc' });
  const [correctionSort, setCorrectionSort] = useState({ key: 'date', dir: 'desc' });
  const [woPage, setWoPage] = useState(1);
  const [woLimit, setWoLimit] = useState('20');
  const [coPage, setCoPage] = useState(1);
  const [coLimit, setCoLimit] = useState('20');

  const opSortKeyMap = { id: 'id', date: 'operationDate', items: 'id', total: 'totalQuantity', note: 'note' };
  const woSortParam = `${opSortKeyMap[writeoffSort.key] || 'operationDate'},${writeoffSort.dir}`;
  const woPageIdx = woPage - 1;
  const woSize = woLimit === 'all' ? 9999 : Number(woLimit);
  const woOffset = woPageIdx * (woLimit === 'all' ? 0 : Number(woLimit));

  const coSortParam = `${opSortKeyMap[correctionSort.key] || 'operationDate'},${correctionSort.dir}`;
  const coPageIdx = coPage - 1;
  const coSize = coLimit === 'all' ? 9999 : Number(coLimit);
  const coOffset = coPageIdx * (coLimit === 'all' ? 0 : Number(coLimit));

  const productsQuery = useQuery({ queryKey: ['products', 'writeoff'], queryFn: () => services.getProducts('') });
  const operationsQuery = useQuery({
    queryKey: ['operations', 'writeoff', woLimit, woPage, writeoffSort],
    queryFn: () => services.getOperations({ filter: 'typeCode==writeoff', page: woPageIdx, size: woSize, sort: woSortParam })
  });
  const correctionsQuery = useQuery({
    queryKey: ['operations', 'correction', coLimit, coPage, correctionSort],
    queryFn: () => services.getOperations({ filter: 'typeCode==correction', page: coPageIdx, size: coSize, sort: coSortParam })
  });

  useRouteRefetch(productsQuery.refetch);
  useRouteRefetch(operationsQuery.refetch);
  useRouteRefetch(correctionsQuery.refetch);

  const getPhoto = (product) => {
    const field = (product?.custom_fields || []).find((f) => String(f.name || '').trim() === FIELD_NAME_OZON_PHOTO);
    return String(field?.value || '').trim();
  };


  const createMutation = useMutation({
    mutationFn: services.createOperation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'writeoff'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'correction'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast('Списание проведено', 'success');
      setAddOpen(false);
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const createCorrectionMutation = useMutation({
    mutationFn: services.createOperation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'writeoff'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'correction'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast('Корректировка проведена', 'success');
      setCorrectionOpen(false);
      setCorrectionMode('create');
      setEditingCorrectionId(null);
      setCorrectionDate(new Date().toISOString().slice(0, 10));
      setCorrectionReason('');
      setCorrectionComment('');
      setCorrectionQuery('');
      setCorrectionItems([]);
      setCorrectionError('');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const updateCorrectionMutation = useMutation({
    mutationFn: ({ id, payload }) => services.updateOperation(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'writeoff'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'correction'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast('Корректировка обновлена', 'success');
      setCorrectionOpen(false);
      setCorrectionMode('create');
      setEditingCorrectionId(null);
      setCorrectionDate(new Date().toISOString().slice(0, 10));
      setCorrectionReason('');
      setCorrectionComment('');
      setCorrectionQuery('');
      setCorrectionItems([]);
      setCorrectionError('');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: services.deleteOperation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'writeoff'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'correction'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast('Операция удалена', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });


  const openCreateCorrection = () => {
    setCorrectionMode('create');
    setEditingCorrectionId(null);
    setCorrectionDate(new Date().toISOString().slice(0, 10));
    setCorrectionReason('');
    setCorrectionComment('');
    setCorrectionQuery('');
    setCorrectionItems([]);
    setCorrectionError('');
    setCorrectionOpen(true);
  };

  const openEditCorrection = async (operation) => {
    try {
      const full = await services.getOperationById(operation.id);
      const products = productsQuery.data || [];
      const rows = (Array.isArray(full.items) ? full.items : [])
        .map((item) => {
          const delta = Number(item?.delta);
          if (!Number.isFinite(delta)) return null;
          const productId = Number(item.productId);
          const product = products.find((p) => p.id === productId);
          const currentStock = Number(product?.quantity || 0);
          const baseQty = Math.max(0, currentStock - delta);
          const actualQty = baseQty + delta;
          return {
            productId,
            productName: item.productName || product?.name || '',
            productSKU: item.productSKU || product?.sku || '',
            productImage: getPhoto(product),
            currentQty: baseQty,
            actualQty: Math.max(0, actualQty)
          };
        })
        .filter(Boolean);

      const noteText = String(full.note || '');
      const reasonMatch = noteText.match(/Причина:\s*([^;]+)/i);
      const commentMatch = noteText.match(/Комментарий:\s*(.+)$/i);

      setCorrectionMode('edit');
      setEditingCorrectionId(Number(full.id));
      setCorrectionDate(String(full.operation_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
      setCorrectionReason(String(reasonMatch?.[1] || '').trim());
      setCorrectionComment(String(commentMatch?.[1] || '').trim());
      setCorrectionQuery('');
      setCorrectionItems(rows);
      setCorrectionError('');
      setCorrectionOpen(true);
    } catch (error) {
      pushToast(error.message || 'Не удалось открыть корректировку для редактирования', 'error');
    }
  };

  const filteredCorrectionProducts = useMemo(() => {
    const q = correctionQuery.trim().toLowerCase();
    if (!q) return [];
    return (productsQuery.data || [])
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 8);
  }, [correctionQuery, productsQuery.data]);

  const addCorrectionProduct = (product) => {
    setCorrectionError('');
    setCorrectionItems((prev) => {
      if (prev.some((row) => row.productId === product.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          productSKU: product.sku,
          productImage: getPhoto(product),
          currentQty: Number(product.quantity || 0),
          actualQty: Number(product.quantity || 0)
        }
      ];
    });
    setCorrectionQuery('');
  };

  const updateCorrectionItem = (productId, patch) => {
    setCorrectionError('');
    setCorrectionItems((prev) => prev.map((row) => (row.productId === productId ? { ...row, ...patch } : row)));
  };

  const removeCorrectionItem = (productId) => {
    setCorrectionError('');
    setCorrectionItems((prev) => prev.filter((row) => row.productId !== productId));
  };

  const submitManualCorrection = (event) => {
    event.preventDefault();
    setCorrectionError('');
    const changed = correctionItems
      .map((row) => {
        const current = Number(row.currentQty || 0);
        const actual = Number(row.actualQty);
        const delta = actual - current;
        return { ...row, current, actual, delta };
      })
      .filter((row) => Number.isFinite(row.delta) && row.delta !== 0);

    if (changed.length === 0) {
      setCorrectionError('Добавьте хотя бы одну позицию с отличием от текущего остатка');
      return;
    }
    if (!String(correctionReason || '').trim()) {
      setCorrectionError('Укажите общую причину корректировки');
      return;
    }

    for (const row of changed) {
      if (!Number.isInteger(row.actual) || row.actual < 0) {
        setCorrectionError(`Некорректный фактический остаток для ${row.productSKU}`);
        return;
      }
    }

    const items = changed.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      productSKU: row.productSKU,
      quantity: Math.abs(row.delta),
      delta: row.delta,
      reason: correctionReason.trim(),
      note:
        correctionComment ||
        (row.delta < 0
          ? `Списать: ${Math.abs(row.delta)} · Факт: ${row.actual}`
          : `Добавить: ${Math.abs(row.delta)} · Факт: ${row.actual}`)
    }));
    const differences = changed.map((row) => ({
      productId: row.productId,
      productSKU: row.productSKU,
      productName: row.productName,
      availableBefore: row.current,
      requestedQty: 0,
      expectedAfter: row.current,
      actualAfter: row.actual,
      correctionDelta: row.delta,
      reason: correctionReason.trim()
    }));
    const total = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    const payload = {
      type: 'correction',
      operation_date: correctionDate,
      note: `Ручная корректировка. Причина: ${correctionReason.trim()}${correctionComment ? `; Комментарий: ${correctionComment}` : ''}`,
      items,
      differences,
      total_quantity: total
    };

    if (correctionMode === 'edit' && editingCorrectionId) {
      updateCorrectionMutation.mutate({ id: editingCorrectionId, payload });
      return;
    }

    createCorrectionMutation.mutate(payload);
  };

  const operationsData = operationsQuery.data?.items || [];
  const operationsTotal = Number(operationsQuery.data?.total || 0);
  const correctionsData = correctionsQuery.data?.items || [];
  const correctionsTotal = Number(correctionsQuery.data?.total || 0);

  const writeoffTotals = {
    operations: operationsTotal,
    positions: operationsData.reduce((sum, op) => sum + (Array.isArray(op.items) ? op.items.length : 0), 0),
    quantity: operationsData.reduce((sum, op) => sum + Number(op.total_quantity || 0), 0)
  };

  const correctionTotals = {
    operations: correctionsTotal,
    positions: correctionsData.reduce((sum, op) => {
      const itemsCount = Array.isArray(op.items) ? op.items.length : 0;
      if (itemsCount > 0) return sum + itemsCount;
      const diffsCount = Array.isArray(op.differences) ? op.differences.length : 0;
      return sum + diffsCount;
    }, 0),
    quantity: correctionsData.reduce((sum, op) => sum + Number(op.total_quantity || 0), 0)
  };

  const woTotalPages = woLimit === 'all' ? 1 : Math.max(1, Math.ceil(operationsTotal / Math.max(1, Number(woLimit))));
  const woRangeStart = operationsTotal === 0 ? 0 : woOffset + 1;
  const woRangeEnd = operationsTotal === 0 ? 0 : Math.min(woOffset + operationsData.length, operationsTotal);

  const coTotalPages = coLimit === 'all' ? 1 : Math.max(1, Math.ceil(correctionsTotal / Math.max(1, Number(coLimit))));
  const coRangeStart = correctionsTotal === 0 ? 0 : coOffset + 1;
  const coRangeEnd = correctionsTotal === 0 ? 0 : Math.min(coOffset + correctionsData.length, correctionsTotal);

  if (productsQuery.isLoading || operationsQuery.isLoading || correctionsQuery.isLoading) return <p>Загрузка...</p>;

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-title-cluster">
          <h1 className="page-title">Списания</h1>
          <div className="page-subtitle">Списания и корректировки остатков</div>
        </div>
        <div className="kpi-strip">
          <div className="kpi"><div className="kpi-label">Списаний</div><div className="kpi-value">{writeoffTotals.operations}</div></div>
          <div className="kpi"><div className="kpi-label">Позиций</div><div className="kpi-value">{writeoffTotals.positions}</div></div>
          <div className="kpi"><div className="kpi-label">Списано шт.</div><div className="kpi-value">{writeoffTotals.quantity}</div></div>
        </div>
      </div>
      <div className="toolbar operation-actions">
        <button className="btn btn-primary operation-action-btn" type="button" onClick={() => setAddOpen(true)}>
          + Добавить списание
        </button>
        <button className="btn operation-action-btn" type="button" onClick={openCreateCorrection}>
          Добавить корректировку
        </button>
      </div>
      <div className="toolbar history-pager">
        <label className="history-pager-label">
          Показывать:
          <select className="input" value={woLimit} onChange={(e) => { setWoLimit(e.target.value); setWoPage(1); }}>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="200">200</option>
            <option value="all">Все</option>
          </select>
        </label>
        <span className="history-pager-range">{woRangeStart}-{woRangeEnd} из {operationsTotal}</span>
        {woLimit !== 'all' && (
          <>
            <button className="btn" type="button" disabled={woPage <= 1} onClick={() => setWoPage((p) => Math.max(1, p - 1))}>Назад</button>
            <span className="history-pager-range">Стр. {woPage} / {woTotalPages}</span>
            <button className="btn" type="button" disabled={woPage >= woTotalPages} onClick={() => setWoPage((p) => Math.min(woTotalPages, p + 1))}>Вперед</button>
          </>
        )}
      </div>
      <OperationsHistory
        title="История списаний"
        operations={operationsData}
        onDelete={(id) => deleteMutation.mutate(id)}
        enableSorting
        sort={writeoffSort}
        onSort={(key) => { setWriteoffSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })); setWoPage(1); }}
      />
      <div className="import-result">
        Корректировок: <strong>{correctionTotals.operations}</strong> · Позиций: <strong>{correctionTotals.positions}</strong> ·
        Объем корректировок (шт): <strong>{correctionTotals.quantity}</strong>
      </div>
      <div className="toolbar history-pager">
        <label className="history-pager-label">
          Показывать:
          <select className="input" value={coLimit} onChange={(e) => { setCoLimit(e.target.value); setCoPage(1); }}>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="200">200</option>
            <option value="all">Все</option>
          </select>
        </label>
        <span className="history-pager-range">{coRangeStart}-{coRangeEnd} из {correctionsTotal}</span>
        {coLimit !== 'all' && (
          <>
            <button className="btn" type="button" disabled={coPage <= 1} onClick={() => setCoPage((p) => Math.max(1, p - 1))}>Назад</button>
            <span className="history-pager-range">Стр. {coPage} / {coTotalPages}</span>
            <button className="btn" type="button" disabled={coPage >= coTotalPages} onClick={() => setCoPage((p) => Math.min(coTotalPages, p + 1))}>Вперед</button>
          </>
        )}
      </div>
      <OperationsHistory
        title="История корректировок"
        operations={correctionsData}
        onDelete={(id) => deleteMutation.mutate(id)}
        onEdit={openEditCorrection}
        canEditOperation={(op) => Array.isArray(op.items) && op.items.some((it) => Number.isFinite(Number(it?.delta)))}
        enableSorting
        sort={correctionSort}
        onSort={(key) => { setCorrectionSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })); setCoPage(1); }}
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Новое списание"
        size="lg"
        footer={
          <button className="btn-cancel" type="button" onClick={() => setAddOpen(false)}>
            Закрыть
          </button>
        }
      >
        <OperationBuilder
          type="writeoff"
          products={productsQuery.data || []}
          onSubmit={(payload) => createMutation.mutate(payload)}
          loading={createMutation.isPending}
          showReason
          stockLimited
        />
      </Modal>

      <Modal
        open={correctionOpen}
        onClose={() => {
          setCorrectionOpen(false);
          setCorrectionMode('create');
          setEditingCorrectionId(null);
        }}
        title={correctionMode === 'edit' ? `Редактировать корректировку #${editingCorrectionId}` : 'Ручная корректировка'}
        size="lg"
        footer={
          <>
            {correctionError && (
              <span className="import-error" style={{ marginRight: 'auto' }}>{correctionError}</span>
            )}
            <button
              type="button"
              className="btn-cancel"
              onClick={() => {
                setCorrectionOpen(false);
                setCorrectionMode('create');
                setEditingCorrectionId(null);
              }}
            >
              Закрыть
            </button>
            <button
              type="submit"
              form="correction-form"
              className="btn btn-primary"
              disabled={(createCorrectionMutation.isPending || updateCorrectionMutation.isPending) || correctionItems.length === 0}
            >
              {createCorrectionMutation.isPending || updateCorrectionMutation.isPending
                ? 'Сохранение...'
                : correctionMode === 'edit'
                  ? 'Сохранить корректировку'
                  : 'Провести корректировку'}
            </button>
          </>
        }
      >
        <form id="correction-form" className="card operation-builder" onSubmit={submitManualCorrection}>
              <div className="form-row">
                <label>
                  Дата
                  <input
                    className="input"
                    type="date"
                    value={correctionDate}
                    onChange={(event) => setCorrectionDate(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Причина *
                  <input
                    className="input"
                    value={correctionReason}
                    onChange={(event) => setCorrectionReason(event.target.value)}
                    placeholder="Например: пересорт после сверки"
                    required
                  />
                </label>
              </div>
              <label>
                Комментарий
                <input
                  className="input"
                  value={correctionComment}
                  onChange={(event) => setCorrectionComment(event.target.value)}
                  placeholder="Необязательно"
                />
              </label>

              <label>
                Добавить товар
                <input
                  className="input"
                  placeholder="Поиск по SKU/названию"
                  value={correctionQuery}
                  onChange={(event) => setCorrectionQuery(event.target.value)}
                />
              </label>

              {filteredCorrectionProducts.length > 0 && (
                <div className="picker-list">
                  {filteredCorrectionProducts.map((product) => (
                    <button
                      className="picker-item"
                      type="button"
                      key={product.id}
                      onClick={() => addCorrectionProduct(product)}
                    >
                      <span>{product.name}</span>
                      <span>{product.sku} · остаток {product.quantity}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="table-wrap operation-table-wrap">
                <table className="table compact operation-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Фото</th>
                      <th>Товар</th>
                      <th>SKU</th>
                      <th>Текущий остаток</th>
                      <th>Фактический остаток</th>
                      <th>Изменение</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {correctionItems.map((row) => {
                      const current = Number(row.currentQty || 0);
                      const actual = Number(row.actualQty || 0);
                      const delta = actual - current;
                      return (
                        <tr key={row.productId}>
                          <td>{row.productId}</td>
                          <td>
                            {row.productImage ? (
                              <img className="product-mini-image" src={row.productImage} alt={row.productName} loading="lazy" />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <span className="cell-ellipsis" title={row.productName}>{row.productName}</span>
                          </td>
                          <td>{row.productSKU}</td>
                          <td>{current}</td>
                          <td>
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={row.actualQty}
                              onChange={(event) =>
                                updateCorrectionItem(row.productId, {
                                  actualQty: Number(event.target.value || 0)
                                })
                              }
                            />
                          </td>
                          <td className={delta < 0 ? 'import-error' : delta > 0 ? 'import-success' : ''}>
                            {delta > 0 ? `+${delta}` : delta}
                          </td>
                          <td>
                            <button
                              className="icon-btn danger"
                              type="button"
                              onClick={() => removeCorrectionItem(row.productId)}
                              aria-label="Удалить"
                              title="Удалить"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

        </form>
      </Modal>
    </div>
  );
}
