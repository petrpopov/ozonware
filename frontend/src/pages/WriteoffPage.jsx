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
  const [writeoffSort, setWriteoffSort] = useState({ key: 'id', dir: 'desc' });
  const [correctionSort, setCorrectionSort] = useState({ key: 'id', dir: 'desc' });

  const productsQuery = useQuery({ queryKey: ['products', 'writeoff'], queryFn: () => services.getProducts('') });
  const operationsQuery = useQuery({
    queryKey: ['operations', 'writeoff'],
    queryFn: () => services.getOperations({ type: 'writeoff', limit: 20 })
  });
  const correctionsQuery = useQuery({
    queryKey: ['operations', 'correction'],
    queryFn: () => services.getOperations({ type: 'correction', limit: 20 })
  });

  useRouteRefetch(productsQuery.refetch);
  useRouteRefetch(operationsQuery.refetch);
  useRouteRefetch(correctionsQuery.refetch);

  const getPhoto = (product) => {
    const field = (product?.custom_fields || []).find((f) => String(f.name || '').trim() === FIELD_NAME_OZON_PHOTO);
    return String(field?.value || '').trim();
  };

  const sortOperations = (operations, sort) => {
    const getValue = (op, key) => {
      if (key === 'id') return Number(op.id || 0);
      if (key === 'date') return String(op.operation_date || '');
      if (key === 'items') return Number(op.items?.length || 0);
      if (key === 'total') return Number(op.total_quantity || 0);
      if (key === 'note') return String(op.note || '');
      return '';
    };
    return [...operations].sort((a, b) => {
      const left = getValue(a, sort.key);
      const right = getValue(b, sort.key);
      const leftNum = Number(left);
      const rightNum = Number(right);
      const bothNum = Number.isFinite(leftNum) && Number.isFinite(rightNum) && left !== '' && right !== '';
      const compare = bothNum
        ? leftNum - rightNum
        : String(left).localeCompare(String(right), 'ru', { numeric: true, sensitivity: 'base' });
      return sort.dir === 'asc' ? compare : -compare;
    });
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

  const writeoffTotals = {
    operations: (operationsQuery.data || []).length,
    positions: (operationsQuery.data || []).reduce((sum, op) => sum + (Array.isArray(op.items) ? op.items.length : 0), 0),
    quantity: (operationsQuery.data || []).reduce((sum, op) => sum + Number(op.total_quantity || 0), 0)
  };

  const correctionTotals = {
    operations: (correctionsQuery.data || []).length,
    positions: (correctionsQuery.data || []).reduce((sum, op) => {
      const itemsCount = Array.isArray(op.items) ? op.items.length : 0;
      if (itemsCount > 0) return sum + itemsCount;
      const diffsCount = Array.isArray(op.differences) ? op.differences.length : 0;
      return sum + diffsCount;
    }, 0),
    quantity: (correctionsQuery.data || []).reduce((sum, op) => sum + Number(op.total_quantity || 0), 0)
  };

  if (productsQuery.isLoading || operationsQuery.isLoading || correctionsQuery.isLoading) return <p>Загрузка...</p>;
  const sortedWriteoffs = sortOperations(operationsQuery.data || [], writeoffSort);
  const sortedCorrections = sortOperations(correctionsQuery.data || [], correctionSort);

  return (
    <div className="stack">
      <div className="toolbar operation-actions">
        <button className="btn operation-action-btn" type="button" onClick={() => setAddOpen(true)}>
          Добавить списание
        </button>
        <button className="btn operation-action-btn" type="button" onClick={openCreateCorrection}>
          Добавить корректировку
        </button>
      </div>

      <div className="import-result">
        Списаний: <strong>{writeoffTotals.operations}</strong> · Позиций: <strong>{writeoffTotals.positions}</strong> ·
        Списано шт: <strong>{writeoffTotals.quantity}</strong>
      </div>
      <OperationsHistory
        title="История списаний"
        operations={sortedWriteoffs}
        onDelete={(id) => deleteMutation.mutate(id)}
        enableSorting
        sort={writeoffSort}
        onSort={(key) =>
          setWriteoffSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
        }
      />
      <div className="import-result">
        Корректировок: <strong>{correctionTotals.operations}</strong> · Позиций: <strong>{correctionTotals.positions}</strong> ·
        Объем корректировок (шт): <strong>{correctionTotals.quantity}</strong>
      </div>
      <OperationsHistory
        title="История корректировок"
        operations={sortedCorrections}
        onDelete={(id) => deleteMutation.mutate(id)}
        onEdit={openEditCorrection}
        canEditOperation={(op) => Array.isArray(op.items) && op.items.some((it) => Number.isFinite(Number(it?.delta)))}
        enableSorting
        sort={correctionSort}
        onSort={(key) =>
          setCorrectionSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
        }
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
                              className="btn btn-danger btn-icon"
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
