import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { services } from '../api/services.js';
import { EditIcon, TrashIcon } from './Icons.jsx';
import { FIELD_NAME_OZON_PHOTO } from '../constants/fieldKinds.js';

export default function OperationsHistory({
  operations,
  onDelete,
  onEdit,
  canEditOperation,
  title,
  enableBulkDelete = false,
  onBulkDelete,
  enableSorting = false,
  sort = { key: 'id', dir: 'desc' },
  onSort,
  showOperationType = false,
  resolveOperationTypeLabel,
  emptyMessage = 'Операций нет',
  emptySubtext = 'Здесь появятся записи после проведения первой операции'
}) {
  const navigate = useNavigate();
  const [selectedOperationId, setSelectedOperationId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const productsQuery = useQuery({
    queryKey: ['products', 'operation-history'],
    queryFn: () => services.getProducts('')
  });
  const detailsQuery = useQuery({
    queryKey: ['operation', selectedOperationId],
    queryFn: () => services.getOperationById(selectedOperationId),
    enabled: selectedOperationId !== null
  });


  useEffect(() => {
    if (!enableBulkDelete) return;
    const available = new Set(operations.map((op) => op.id));
    setSelectedIds((prev) => prev.filter((id) => available.has(id)));
  }, [operations, enableBulkDelete]);

  const selectedOperation = detailsQuery.data || operations.find((op) => op.id === selectedOperationId) || null;
  const allSelected = operations.length > 0 && operations.every((op) => selectedIds.includes(op.id));
  const productsById = useMemo(
    () => new Map((productsQuery.data || []).map((product) => [Number(product.id), product])),
    [productsQuery.data]
  );
  const getPhoto = (product) => {
    if (!product) return '';
    const field = (product.custom_fields || []).find((f) => String(f.name || '').trim() === FIELD_NAME_OZON_PHOTO);
    return String(field?.value || '').trim();
  };
  const getPositionsCount = (op) => {
    const itemsCount = Array.isArray(op?.items) ? op.items.length : 0;
    if (itemsCount > 0) return itemsCount;
    if (op?.type_code === 'correction' && Array.isArray(op?.differences)) {
      return op.differences.length;
    }
    return 0;
  };
  const renderSortMark = (key) => {
    if (!enableSorting) return '';
    if (sort.key !== key) return '↕';
    return sort.dir === 'asc' ? '↑' : '↓';
  };
  const handleSort = (key) => {
    if (!enableSorting || !onSort) return;
    onSort(key);
  };

  const detailItems = useMemo(() => {
    if (!selectedOperation) {
      return [];
    }
    const rawItems = Array.isArray(selectedOperation.items) ? selectedOperation.items : [];
    if (rawItems.length > 0) {
      return rawItems.map((item, index) => ({
        key: `${item.productId || item.productSKU || item.productName || 'row'}-${index}`,
        productId: Number(item.productId || 0) || null,
        sku: item.productSKU || item.sku || '—',
        name: item.productName || item.name || '—',
        quantity: Number(item.quantity || 0),
        reason: item.reason || '',
        note:
          item.note ||
          (Number.isFinite(Number(item.delta))
            ? Number(item.delta) < 0
              ? `Списать: ${Math.abs(Number(item.delta))} · Факт: н/д`
              : `Добавить: ${Math.abs(Number(item.delta))} · Факт: н/д`
            : ''),
        image: getPhoto(productsById.get(Number(item.productId)))
      }));
    }

    if (selectedOperation.type_code === 'correction' && Array.isArray(selectedOperation.differences)) {
      return selectedOperation.differences.map((diff, index) => ({
        key: `${diff.productId || diff.productSKU || diff.productName || 'corr'}-${index}`,
        productId: Number(diff.productId || 0) || null,
        sku: diff.productSKU || '—',
        name: diff.productName || '—',
        quantity: Math.abs(Number(diff.correctionDelta || 0)),
        reason: diff.reason || '',
        note: `Было: ${Number(diff.availableBefore || 0)} · Списать: ${Number(diff.requestedQty || 0)} · Факт: ${Number(diff.actualAfter || 0)}`,
        image: getPhoto(productsById.get(Number(diff.productId)))
      }));
    }

    return [];
  }, [selectedOperation, productsById]);

  const toggleSelectOne = (id, checked) => {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      }
      return prev.filter((item) => item !== id);
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(operations.map((op) => op.id));
      return;
    }
    setSelectedIds([]);
  };

  const handleBulkDelete = () => {
    if (!enableBulkDelete || !onBulkDelete || selectedIds.length === 0) return;
    onBulkDelete(selectedIds);
  };

  return (
    <section className="card">
      <h3>{title}</h3>
      {enableBulkDelete && (
        <div className="toolbar">
          <button
            className="btn btn-danger"
            type="button"
            disabled={selectedIds.length === 0}
            onClick={handleBulkDelete}
          >
            Удалить выделенные ({selectedIds.length})
          </button>
          <button
            className="btn"
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => setSelectedIds([])}
          >
            Сбросить выбор
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              {enableBulkDelete && (
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => toggleSelectAll(event.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
              )}
              <th className={enableSorting ? 'sortable' : ''} onClick={() => handleSort('id')}>
                ID{enableSorting && <span>{renderSortMark('id')}</span>}
              </th>
              <th className={enableSorting ? 'sortable' : ''} onClick={() => handleSort('date')}>
                Дата{enableSorting && <span>{renderSortMark('date')}</span>}
              </th>
              {showOperationType && (
                <th className={enableSorting ? 'sortable' : ''} onClick={() => handleSort('opType')}>
                  Тип{enableSorting && <span>{renderSortMark('opType')}</span>}
                </th>
              )}
              <th className={enableSorting ? 'sortable' : ''} onClick={() => handleSort('items')}>
                Позиций{enableSorting && <span>{renderSortMark('items')}</span>}
              </th>
              <th className={enableSorting ? 'sortable' : ''} onClick={() => handleSort('total')}>
                Всего штук{enableSorting && <span>{renderSortMark('total')}</span>}
              </th>
              <th className={enableSorting ? 'sortable' : ''} onClick={() => handleSort('note')}>
                Примечание{enableSorting && <span>{renderSortMark('note')}</span>}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {operations.length === 0 && (
              <tr>
                <td colSpan={showOperationType ? (enableBulkDelete ? 8 : 7) : (enableBulkDelete ? 7 : 6)} style={{ padding: 0, border: 'none' }}>
                  <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 6px', fontWeight: 500, color: 'var(--text)' }}>{emptyMessage}</p>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>{emptySubtext}</p>
                  </div>
                </td>
              </tr>
            )}
            {operations.map((op) => (
              <tr
                key={op.id}
                className="row-clickable"
                onClick={() => setSelectedOperationId(op.id)}
                tabIndex={0}
                role="button"
                aria-label={`Открыть операцию ${op.id}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedOperationId(op.id);
                  }
                }}
              >
                {enableBulkDelete && (
                  <td
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(op.id)}
                      onChange={(event) => toggleSelectOne(op.id, event.target.checked)}
                      aria-label={`Выбрать операцию ${op.id}`}
                    />
                  </td>
                )}
                <td>{op.id}</td>
                <td>{(op.operation_date || '').slice(0, 10)}</td>
                {showOperationType && (
                  <td>{resolveOperationTypeLabel ? resolveOperationTypeLabel(op) : (op.type_code || '—')}</td>
                )}
                <td>{getPositionsCount(op)}</td>
                <td>{op.total_quantity}</td>
                <td>
                  {op.channel_code === 'ozon_fbs' && <span className="channel-badge channel-badge--fbs">OZON FBS</span>}
                  {op.channel_code === 'ozon_fbo' && <span className="channel-badge channel-badge--fbo">OZON FBO</span>}
                  <span className="cell-ellipsis" title={op.note || '—'}>{op.note || '—'}</span>
                </td>
                <td className="row-actions">
                  {onEdit && (!canEditOperation || canEditOperation(op)) && (
                    <button
                      className="btn btn-icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(op);
                      }}
                      aria-label="Редактировать"
                      title="Редактировать"
                    >
                      <EditIcon />
                    </button>
                  )}
                  <button
                    className="btn btn-danger btn-icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(op.id);
                    }}
                    aria-label="Удалить"
                    title="Удалить"
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={selectedOperationId !== null}
        onClose={() => setSelectedOperationId(null)}
        title={`Операция #${selectedOperationId ?? ''}`}
        size="md"
        footer={
          <button className="btn-cancel" type="button" onClick={() => setSelectedOperationId(null)}>
            Закрыть
          </button>
        }
      >
        {detailsQuery.isLoading && <p>Загрузка...</p>}
        {!detailsQuery.isLoading && selectedOperation && (
          <div className="stack-sm">
                <div className="import-result">
                  Дата: <strong>{(selectedOperation.operation_date || '').slice(0, 10) || '—'}</strong> · Тип:{' '}
                  <strong>{selectedOperation.type_code || '—'}</strong> · Позиций: <strong>{detailItems.length}</strong> ·
                  Всего штук: <strong>{selectedOperation.total_quantity || 0}</strong>
                </div>
                <div className="import-result">
                  Примечание: <strong>{selectedOperation.note || '—'}</strong>
                </div>

                <div className="table-wrap receipt-import-preview">
                  <table className="table compact table-compact">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Фото</th>
                        <th>SKU</th>
                        <th>Товар</th>
                        <th>Количество</th>
                        <th>Причина</th>
                        <th>Комментарий</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItems.length === 0 && (
                        <tr>
                          <td colSpan={7} className="empty-row">Нет данных по позициям</td>
                        </tr>
                      )}
                      {detailItems.map((item) => (
                        <tr key={item.key}>
                          <td>
                            {item.productId ? (
                              <button
                                type="button"
                                className="id-link-btn"
                                onClick={() => navigate(`/products/${item.productId}`)}
                                title={`Открыть карточку товара #${item.productId}`}
                              >
                                {item.productId}
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {item.image ? (
                              <img className="product-mini-image" src={item.image} alt={item.name || item.sku} loading="lazy" />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{item.sku}</td>
                          <td>{item.name}</td>
                          <td>{item.quantity}</td>
                          <td>{item.reason || '—'}</td>
                          <td>
                            <span className="cell-ellipsis" title={item.note || '—'}>{item.note || '—'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

          </div>
        )}
      </Modal>
    </section>
  );
}
