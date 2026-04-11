import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { FIELD_NAME_OZON_PHOTO } from '../constants/fieldKinds.js';

function getProductPhoto(product) {
  if (!product) return '';
  const field = (product.custom_fields || []).find((f) => String(f.name || '').trim() === FIELD_NAME_OZON_PHOTO);
  return String(field?.value || '').trim();
}

export default function ShipmentEditModal({ open, onClose, form, products, loading, onSubmit }) {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [expandedDeficit, setExpandedDeficit] = useState(new Set());
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!form) {
      setDate('');
      setNote('');
      setItems([]);
      setQuery('');
      setExpandedDeficit(new Set());
      setSubmitError('');
      return;
    }
    setDate(form.date || new Date().toISOString().slice(0, 10));
    setNote(form.note || '');
    const formItems = Array.isArray(form.items) ? form.items : [];
    setItems(formItems);
    setQuery('');
    setSubmitError('');
    // Авто-раскрываем deficit-блок для товаров с уже заполненной причиной корректировки
    const preExpanded = new Set();
    formItems.forEach((item) => {
      if (String(item.correctionReason || '').trim()) {
        preExpanded.add(item.productId);
      }
    });
    setExpandedDeficit(preExpanded);
  }, [form]);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower))
      .slice(0, 8);
  }, [products, query]);

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
          quantity: 1,
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

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.productId !== id));
    setExpandedDeficit((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const changeQtyByStep = (item, step) => {
    const next = Math.max(1, Number(item.quantity || 1) + step);
    updateItem(item.productId, { quantity: next });
  };

  const expandDeficit = (productId) => {
    setExpandedDeficit((prev) => {
      const next = new Set(prev);
      next.add(productId);
      return next;
    });
  };

  const collapseDeficit = (productId) => {
    setExpandedDeficit((prev) => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  };

  const handleSubmit = () => {
    setSubmitError('');
    const shortageAdjustments = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      const currentQty = Number(product?.quantity || 0);
      const requestedQty = Number(item.quantity || 0);

      if (requestedQty > currentQty) {
        const actualRemaining = Number(item.actualRemaining);
        const reason = String(item.correctionReason || '').trim();

        if (!Number.isInteger(actualRemaining) || actualRemaining < 0) {
          expandDeficit(item.productId);
          setSubmitError(`Укажите корректный фактический остаток для ${item.productSKU}`);
          return;
        }
        if (actualRemaining > currentQty) {
          expandDeficit(item.productId);
          setSubmitError(`Фактический остаток для ${item.productSKU} не может быть больше текущего остатка`);
          return;
        }
        if (!reason) {
          expandDeficit(item.productId);
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

    const total = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    onSubmit({
      type: 'shipment',
      operation_date: date,
      note,
      total_quantity: total,
      items: items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        productSKU: item.productSKU,
        quantity: Number(item.quantity || 0)
      })),
      allow_shortage: true,
      shortage_adjustments: shortageAdjustments
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Редактировать отгрузку #${form?.id ?? ''}`}
      className="shipment-edit-modal"
      footer={
        <>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || items.length === 0}
          >
            {loading ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      {!form ? (
        <p>Загрузка...</p>
      ) : (
        <>
          <div className="shipment-edit-meta">
            <label className="meta-field">
              <span className="meta-label">Дата</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="meta-field">
              <span className="meta-label">Примечание</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>

          <div className="shipment-edit-search">
            <input
              className="input"
              placeholder="Поиск по SKU / названию — добавить товар"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {filtered.length > 0 && (
              <div className="picker-list">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="picker-item"
                    onClick={() => addItem(p)}
                  >
                    <span>{p.name}</span>
                    <span>{p.sku} · остаток {p.quantity}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="shipment-edit-items">
            {items.map((item) => {
              const product = products.find((p) => p.id === item.productId);
              const stock = Number(product?.quantity || 0);
              const shortage = Number(item.quantity || 0) - stock;
              const hasShortage = shortage > 0;
              const isExpanded = expandedDeficit.has(item.productId);
              const photo = item.productImage || getProductPhoto(product);

              return (
                <div className="shipment-edit-item" key={item.productId}>
                  <div className="shipment-edit-item__main">
                    {photo ? (
                      <img
                        className="shipment-edit-item__photo"
                        src={photo}
                        alt={item.productName}
                        loading="lazy"
                      />
                    ) : (
                      <div className="shipment-edit-item__photo is-empty" />
                    )}
                    <div className="shipment-edit-item__body">
                      <div className="shipment-edit-item__name">{item.productName}</div>
                      <div className="shipment-edit-item__meta">{item.productSKU} · остаток: {stock}</div>
                    </div>
                    <div className="qty-control">
                      <button
                        type="button"
                        className="btn qty-step"
                        disabled={Number(item.quantity || 1) <= 1}
                        onClick={() => changeQtyByStep(item, -1)}
                        aria-label="Уменьшить"
                      >
                        −
                      </button>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(item.productId, { quantity: Number(e.target.value || 1) })}
                      />
                      <button
                        type="button"
                        className="btn qty-step"
                        onClick={() => changeQtyByStep(item, 1)}
                        aria-label="Увеличить"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="del-btn"
                      aria-label="Удалить"
                      onClick={() => removeItem(item.productId)}
                    >
                      ×
                    </button>
                  </div>

                  {hasShortage && !isExpanded && (
                    <button
                      type="button"
                      className="shipment-edit-item__deficit-toggle"
                      onClick={() => expandDeficit(item.productId)}
                    >
                      ⚠ Дефицит {shortage} шт. — развернуть
                    </button>
                  )}

                  {hasShortage && isExpanded && (
                    <div className="shipment-edit-item__deficit">
                      <label className="meta-field">
                        <span className="meta-label">Фактический остаток</span>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={stock}
                          value={item.actualRemaining ?? stock}
                          onChange={(e) =>
                            updateItem(item.productId, { actualRemaining: Number(e.target.value || 0) })
                          }
                        />
                      </label>
                      <label className="meta-field">
                        <span className="meta-label">Причина корректировки</span>
                        <input
                          className="input"
                          value={item.correctionReason || ''}
                          onChange={(e) =>
                            updateItem(item.productId, { correctionReason: e.target.value })
                          }
                          placeholder="Например: пересорт"
                        />
                      </label>
                      <div className="shipment-edit-item__deficit-msg">Будет создана автокорректировка</div>
                      <button
                        type="button"
                        className="shipment-edit-item__deficit-collapse"
                        onClick={() => collapseDeficit(item.productId)}
                      >
                        свернуть
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {items.length === 0 && (
              <div className="shipment-edit-empty">Добавьте товары через поиск выше</div>
            )}
          </div>

          {submitError && <div className="shipment-edit-error">{submitError}</div>}
        </>
      )}
    </Modal>
  );
}
