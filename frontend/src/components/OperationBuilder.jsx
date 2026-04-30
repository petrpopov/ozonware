import { useEffect, useMemo, useState } from 'react';
import { TrashIcon } from './Icons.jsx';
import { FIELD_NAME_OZON_PHOTO } from '../constants/fieldKinds.js';

export default function OperationBuilder({
  products,
  type,
  onSubmit,
  loading,
  showReason = false,
  stockLimited = false,
  allowNegativeWithCorrection = false,
  initialData = null,
  submitLabel = 'Провести'
}) {
  const makeInitialState = () => ({
    query: '',
    date: initialData?.date || new Date().toISOString().slice(0, 10),
    note: initialData?.note || '',
    items: Array.isArray(initialData?.items) ? initialData.items : []
  });

  const initialState = makeInitialState();
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(initialState.date);
  const [note, setNote] = useState(initialState.note);
  const [items, setItems] = useState(initialState.items);
  const [submitError, setSubmitError] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower))
      .slice(0, 8);
  }, [products, query]);

  const getProductPhoto = (product) => {
    if (!product) return '';
    const field = (product.custom_fields || []).find((f) => String(f.name || '').trim() === FIELD_NAME_OZON_PHOTO);
    return String(field?.value || '').trim();
  };

  const defaultQty = type === 'receipt' ? 10 : 1;

  const addItem = (product) => {
    setSubmitError('');
    setItems((prev) => {
      const existing = prev.find((it) => it.productId === product.id);
      if (existing) {
        return prev.map((it) =>
          it.productId === product.id ? { ...it, quantity: it.quantity + 1 } : it
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          productSKU: product.sku,
          productImage: getProductPhoto(product),
          quantity: defaultQty,
          reason: 'defect',
          note: '',
          actualRemaining: Number(product.quantity || 0),
          correctionReason: ''
        }
      ];
    });
    setQuery('');
  };

  const updateItem = (id, patch) => {
    setSubmitError('');
    setItems((prev) => prev.map((item) => (item.productId === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id) => setItems((prev) => prev.filter((item) => item.productId !== id));

  const changeQtyByStep = (item, step) => {
    const product = products.find((p) => p.id === item.productId);
    const max = stockLimited && !allowNegativeWithCorrection && product ? product.quantity : undefined;
    const next = Math.max(1, Number(item.quantity || 1) + step);
    const bounded = max ? Math.min(max, next) : next;
    updateItem(item.productId, { quantity: bounded });
  };

  const submit = (event) => {
    event.preventDefault();
    setSubmitError('');
    const shortageAdjustments = [];
    if (allowNegativeWithCorrection) {
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId);
        const currentQty = Number(product?.quantity || 0);
        const requestedQty = Number(item.quantity || 0);
        if (requestedQty > currentQty) {
          const actualRemaining = Number(item.actualRemaining);
          const reason = String(item.correctionReason || '').trim();
          if (!Number.isInteger(actualRemaining) || actualRemaining < 0) {
            setSubmitError(`Укажите корректный фактический остаток для ${item.productSKU}`);
            return;
          }
          if (actualRemaining > currentQty) {
            setSubmitError(`Фактический остаток для ${item.productSKU} не может быть больше текущего остатка`);
            return;
          }
          if (!reason) {
            setSubmitError(`Укажите причину корректировки для ${item.productSKU}`);
            return;
          }
          shortageAdjustments.push({
            productId: item.productId,
            actual_remaining: actualRemaining,
            reason
          });
        }
      }
    }

    const total = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    onSubmit({
      type,
      operation_date: date,
      note,
      total_quantity: total,
      items: items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        productSKU: item.productSKU,
        quantity: Number(item.quantity || 0),
        ...(showReason ? { reason: item.reason, note: item.note || '' } : {})
      })),
      ...(allowNegativeWithCorrection
        ? { allow_shortage: true, shortage_adjustments: shortageAdjustments }
        : {})
    });
    if (!initialData) {
      setItems([]);
    }
  };

  useEffect(() => {
    if (!initialData) {
      setDate(new Date().toISOString().slice(0, 10));
      setNote('');
      setItems([]);
      setQuery('');
      setSubmitError('');
      return;
    }
    setDate(initialData.date || new Date().toISOString().slice(0, 10));
    setNote(initialData.note || '');
    setItems(Array.isArray(initialData.items) ? initialData.items : []);
    setQuery('');
    setSubmitError('');
  }, [initialData]);

  return (
    <form onSubmit={submit} className="card operation-builder">
      <div className="form-row">
        <label>
          Дата
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Примечание
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <label>
        Добавить товар
        <input
          className="input"
          placeholder="Поиск по SKU/названию"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {filtered.length > 0 && (
        <div className="picker-list">
          {filtered.map((product) => (
            <button className="picker-item" type="button" key={product.id} onClick={() => addItem(product)}>
              <span>{product.name}</span>
              <span>{product.sku} · остаток {product.quantity}</span>
            </button>
          ))}
        </div>
      )}

      <div className="table-wrap operation-table-wrap">
        <table className={`table compact operation-table ${showReason ? 'operation-table-reason' : ''}`}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Фото</th>
              <th>Товар</th>
              <th>SKU</th>
              <th>Количество</th>
              {showReason && <th>Причина</th>}
              {showReason && <th>Комментарий</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const product = products.find((p) => p.id === item.productId);
              const currentQty = Number(product?.quantity || 0);
              const max = stockLimited && !allowNegativeWithCorrection && product ? product.quantity : undefined;
              const hasShortage = allowNegativeWithCorrection && Number(item.quantity || 0) > currentQty;
              return (
                <tr key={item.productId}>
                  <td>{item.productId}</td>
                  <td>
                    {(item.productImage || getProductPhoto(product)) ? (
                      <img
                        className="product-mini-image"
                        src={item.productImage || getProductPhoto(product)}
                        alt={item.productName || item.productSKU}
                        loading="lazy"
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className="cell-ellipsis" title={item.productName}>{item.productName}</span>
                  </td>
                  <td>
                    <span className="cell-ellipsis" title={item.productSKU}>{item.productSKU}</span>
                  </td>
                  <td>
                    <div className="stack-sm">
                      <div className="qty-control">
                        <button
                          className="btn qty-step"
                          type="button"
                          onClick={() => changeQtyByStep(item, -1)}
                          disabled={Number(item.quantity || 1) <= 1}
                          aria-label="Уменьшить количество"
                          title="Уменьшить"
                        >
                          −
                        </button>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={max}
                          value={item.quantity}
                          onChange={(e) => updateItem(item.productId, { quantity: Number(e.target.value || 1) })}
                        />
                        <button
                          className="btn qty-step"
                          type="button"
                          onClick={() => changeQtyByStep(item, 1)}
                          disabled={Boolean(max) && Number(item.quantity || 0) >= max}
                          aria-label="Увеличить количество"
                          title="Увеличить"
                        >
                          +
                        </button>
                      </div>
                      {hasShortage && (
                        <div className="stack-sm">
                          <div className="import-error">
                            Дефицит: {Number(item.quantity || 0) - currentQty} шт. Будет создана корректировка.
                          </div>
                          <label>
                            Фактический остаток после отгрузки
                            <input
                              className="input"
                              type="number"
                              min={0}
                              max={currentQty}
                              value={item.actualRemaining ?? currentQty}
                              onChange={(e) =>
                                updateItem(item.productId, { actualRemaining: Number(e.target.value || 0) })
                              }
                            />
                          </label>
                          <label>
                            Причина корректировки
                            <input
                              className="input"
                              value={item.correctionReason || ''}
                              onChange={(e) => updateItem(item.productId, { correctionReason: e.target.value })}
                              placeholder="Например: пересорт / ошибка отгрузки"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </td>
                  {showReason && (
                    <td>
                      <select
                        className="input"
                        value={item.reason}
                        onChange={(e) => updateItem(item.productId, { reason: e.target.value })}
                      >
                        <option value="defect">Брак</option>
                        <option value="loss">Потеря</option>
                        <option value="reserve">Резерв</option>
                      </select>
                    </td>
                  )}
                  {showReason && (
                    <td>
                      <input
                        className="input operation-comment-input"
                        value={item.note || ''}
                        onChange={(e) => updateItem(item.productId, { note: e.target.value })}
                      />
                    </td>
                  )}
                  <td>
                    <button
                      className="icon-btn danger"
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      aria-label="Удалить"
                      title="Удалить"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="modal-actions">
        {submitError && <div className="import-error">{submitError}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading || items.length === 0}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
