import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';
import { useUiStore } from '../store/useUiStore.js';
import Modal from '../components/Modal.jsx';

const REASON_SHORTAGE_CODE = 'shortage_delivery';
const REASON_EXCESS_CODE = 'excess_return';

function ProductCombobox({ products, value, onChange, suggestedMap, suggestedLabel }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openDropdown = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        zIndex: 9999,
        top: rect.bottom + 2,
        left: rect.left,
        width: rect.width,
      });
    }
    setOpen(true);
  };

  const selected = products.find((p) => p.id === value) || null;
  const inputDisplay = open ? query : (selected ? `${selected.name} (${selected.sku})` : '');

  const filtered = query
    ? products.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase())
      )
    : products;

  const suggested = suggestedMap ? filtered.filter((p) => suggestedMap.has(Number(p.id))) : [];
  const rest = suggestedMap ? filtered.filter((p) => !suggestedMap.has(Number(p.id))) : filtered;

  const dropdown = open && createPortal(
    <div style={{
      ...dropdownStyle,
      maxHeight: '220px', overflowY: 'auto',
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: '4px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    }}>
      {suggested.length > 0 && (
        <>
          <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-warning)', fontWeight: 600, letterSpacing: '0.05em' }}>
            {suggestedLabel}
          </div>
          {suggested.map((p) => {
            const diff = suggestedMap.get(Number(p.id));
            return (
              <div key={p.id}
                style={{ padding: '6px 10px', cursor: 'pointer', borderLeft: '2px solid var(--color-warning)' }}
                onMouseDown={() => { onChange(p, diff); setQuery(''); setOpen(false); }}
              >
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <span style={{ color: 'var(--color-muted)', fontSize: '12px', marginLeft: '6px', fontFamily: 'var(--font-mono)' }}>{p.sku}</span>
                <span style={{ color: 'var(--color-warning)', marginLeft: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>×{diff}</span>
              </div>
            );
          })}
          {rest.length > 0 && <div style={{ height: '1px', background: 'var(--color-border)', margin: '2px 0' }} />}
        </>
      )}
      {rest.map((p) => (
        <div key={p.id}
          style={{ padding: '6px 10px', cursor: 'pointer' }}
          onMouseDown={() => { onChange(p, null); setQuery(''); setOpen(false); }}
        >
          <span>{p.name}</span>
          <span style={{ color: 'var(--color-muted)', fontSize: '12px', marginLeft: '6px', fontFamily: 'var(--font-mono)' }}>{p.sku}</span>
        </div>
      ))}
      {filtered.length === 0 && (
        <div style={{ padding: '8px', color: 'var(--color-muted)', fontSize: '13px' }}>Ничего не найдено</div>
      )}
    </div>,
    document.body
  );

  return (
    <div style={{ position: 'relative', flex: 2 }} ref={containerRef}>
      <input
        ref={inputRef}
        className="input"
        style={{ width: '100%' }}
        placeholder="Введите название или SKU..."
        value={inputDisplay}
        onChange={(e) => { setQuery(e.target.value); openDropdown(); }}
        onFocus={() => { setQuery(''); openDropdown(); }}
      />
      {dropdown}
    </div>
  );
}

const STATUS_LABELS = {
  planned: 'Запланирован',
  partial: 'Частично',
  matched: 'Сошлось',
  closed: 'Закрыт',
};

const STATUS_COLORS = {
  planned: 'var(--color-muted)',
  partial: 'var(--color-warning)',
  matched: 'var(--color-success)',
  closed: 'var(--color-muted)',
};

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  const color = STATUS_COLORS[status] || 'var(--color-muted)';
  return <span className="badge" style={{ color }}>{label}</span>;
}

function diffColor(diff) {
  if (diff === 0) return 'var(--color-success)';
  if (diff > 0) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

export default function PlannedSupplyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const [closeNote, setCloseNote] = useState('');
  const [closePromptOpen, setClosePromptOpen] = useState(false);

  // Correction state
  const [corrOpen, setCorrOpen] = useState(false);
  const [corrEditId, setCorrEditId] = useState(null); // null = create, number = edit
  const [corrReceiptId, setCorrReceiptId] = useState(null);
  const [corrType, setCorrType] = useState('receipt');
  const [corrDate, setCorrDate] = useState('');
  const [corrNote, setCorrNote] = useState('');
  const [corrReasonId, setCorrReasonId] = useState(null);
  const [corrItems, setCorrItems] = useState([{ productId: null, productName: '', productSku: '', quantity: 1 }]);
  const [corrReasons, setCorrReasons] = useState([]);
  const [corrPlanDiff, setCorrPlanDiff] = useState(null);

  const supplyQuery = useQuery({
    queryKey: ['planned-supply', id],
    queryFn: () => services.getPlannedSupplyById(id),
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'supply-correction'],
    queryFn: () => services.getProducts(''),
  });

  const corrMutation = useMutation({
    mutationFn: (payload) => services.createOperation(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-supply', id] });
      pushToast('Корректировка проведена', 'success');
      closeCorrModal();
    },
    onError: (err) => pushToast(err.message || 'Ошибка', 'error'),
  });

  const editCorrMutation = useMutation({
    mutationFn: ({ corrId, payload }) => services.updateOperation(corrId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-supply', id] });
      pushToast('Корректировка обновлена', 'success');
      closeCorrModal();
    },
    onError: (err) => pushToast(err.message || 'Ошибка', 'error'),
  });

  const deleteCorrMutation = useMutation({
    mutationFn: (corrId) => services.deleteOperation(corrId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-supply', id] });
      pushToast('Корректировка удалена', 'success');
    },
    onError: (err) => pushToast(err.message || 'Ошибка', 'error'),
  });

  const closeCorrModal = () => {
    setCorrOpen(false);
    setCorrEditId(null);
  };

  const openEditCorr = (corr, parentReceiptId) => {
    setCorrEditId(corr.id);
    setCorrType(corr.type_code);
    setCorrDate(corr.operation_date || new Date().toISOString().slice(0, 10));
    setCorrNote(corr.note || '');
    setCorrReasonId(corr.correction_reason_id || null);
    setCorrReceiptId(parentReceiptId);
    setCorrItems(
      (corr.items || []).length > 0
        ? corr.items.map((ci) => ({
            productId: ci.product_id,
            productName: ci.product_name || '',
            productSku: ci.sku || '',
            quantity: Math.abs(ci.quantity),
          }))
        : [{ productId: null, productName: '', productSku: '', quantity: 1 }]
    );
    setCorrOpen(true);
  };

  useEffect(() => {
    if (!corrOpen) return;
    services.getDictionary('correction_reasons')
      .then((data) => setCorrReasons(Array.isArray(data) ? data : (data?.items || [])))
      .catch(() => {});

    // In edit mode the form is already pre-filled by openEditCorr — don't reset
    if (corrEditId !== null) return;

    setCorrDate(new Date().toISOString().slice(0, 10));
    setCorrNote('');
    setCorrReasonId(null);
    setCorrItems([{ productId: null, productName: '', productSku: '', quantity: 1 }]);
    setCorrPlanDiff(null);

    const receipts = supply?.operations || [];
    const receipt = receipts.find((r) => r.id === corrReceiptId) || receipts[0];
    if (receipt) {
      const planItems = supply?.items || [];
      const actualByProductId = new Map(
        (receipt.items || []).map((i) => [Number(i.product_id || 0), Number(i.quantity || 0)])
      );
      const surpluses = new Map();
      const shortages = new Map();
      for (const pi of planItems) {
        const pid = Number(pi.product_id);
        const planned = Number(pi.planned_quantity);
        const actual = actualByProductId.get(pid) || 0;
        const diff = actual - planned;
        if (diff > 0) surpluses.set(pid, diff);
        else if (diff < 0) shortages.set(pid, -diff);
      }
      setCorrPlanDiff({ surpluses, shortages });
    }
  }, [corrOpen, corrReceiptId, corrEditId]);

  const submitCorrection = () => {
    const validItems = corrItems.filter((ci) => ci.productId && ci.quantity > 0);
    if (validItems.length === 0) {
      pushToast('Добавьте хотя бы одну позицию', 'error');
      return;
    }
    const payload = {
      operation_date: corrDate,
      note: corrNote || undefined,
      correction_reason_id: corrReasonId || undefined,
      items: validItems.map((ci) => ({
        productId: Number(ci.productId),
        quantity: Number(ci.quantity),
        productName: ci.productName || undefined,
        productSKU: ci.productSku || undefined,
      })),
      total_quantity: validItems.reduce((s, ci) => s + Number(ci.quantity), 0),
    };
    if (corrEditId !== null) {
      editCorrMutation.mutate({ corrId: corrEditId, payload });
    } else {
      const parentId = corrReceiptId || supply?.operations?.[0]?.id;
      if (!parentId) {
        pushToast('Нет приёмки для корректировки', 'error');
        return;
      }
      corrMutation.mutate({ ...payload, type: corrType, parent_operation_id: parentId });
    }
  };

  const closeMutation = useMutation({
    mutationFn: (note) => services.closePlannedSupply(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-supply', id] });
      queryClient.invalidateQueries({ queryKey: ['planned-supplies'] });
      pushToast('План закрыт', 'success');
      setClosePromptOpen(false);
      setCloseNote('');
    },
    onError: (err) => pushToast(err.message || 'Ошибка', 'error'),
  });

  const supply = supplyQuery.data;

  // Build fact quantities map from receipts and their corrections
  const factBySkuFromReceipts = useMemo(() => {
    if (!supply?.operations?.length) return {};
    const map = {};
    const addItems = (items) => {
      for (const item of (items || [])) {
        const sku = item.sku || item.productSKU || item.product_sku;
        if (!sku) continue;
        const qty = Number(item.quantity || item.qty || 0);
        if (qty !== 0) map[sku] = (map[sku] || 0) + qty;
      }
    };
    for (const receipt of supply.operations) {
      addItems(receipt.items);
      for (const corr of (receipt.corrections || [])) {
        addItems(corr.items);
      }
    }
    return map;
  }, [supply]);

  if (supplyQuery.isLoading) {
    return (
      <div className="stack">
        <p style={{ color: 'var(--color-muted)' }}>Загрузка...</p>
      </div>
    );
  }

  if (supplyQuery.isError || !supply) {
    return (
      <div className="stack">
        <p style={{ color: 'var(--color-danger)' }}>Ошибка загрузки данных</p>
        <button className="btn" onClick={() => navigate('/planned-supplies')}>← К поставкам</button>
      </div>
    );
  }

  const items = supply.items || [];
  const receipts = supply.operations || [];

  return (
    <div className="stack">
      {/* Header */}
      <div className="toolbar">
        <button className="btn" onClick={() => navigate('/planned-supplies')}>← К поставкам</button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {supply.status !== 'closed' && !closePromptOpen && (
            <button className="btn" onClick={() => setClosePromptOpen(true)}>Закрыть план</button>
          )}
        </div>
      </div>

      {/* Plan info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: '12px', color: 'var(--color-muted)' }}>Название</p>
          <p style={{ margin: 0, fontWeight: 600 }}>{supply.title}</p>
        </div>
        {supply.supplier && (
          <div>
            <p style={{ margin: '0 0 2px', fontSize: '12px', color: 'var(--color-muted)' }}>Поставщик</p>
            <p style={{ margin: 0 }}>{supply.supplier}</p>
          </div>
        )}
        {supply.planned_date && (
          <div>
            <p style={{ margin: '0 0 2px', fontSize: '12px', color: 'var(--color-muted)' }}>Плановая дата</p>
            <p style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{supply.planned_date}</p>
          </div>
        )}
        <div>
          <p style={{ margin: '0 0 2px', fontSize: '12px', color: 'var(--color-muted)' }}>Статус</p>
          <p style={{ margin: 0 }}>{statusBadge(supply.status)}</p>
        </div>
        {supply.source_file && (
          <div>
            <p style={{ margin: '0 0 2px', fontSize: '12px', color: 'var(--color-muted)' }}>Файл</p>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-muted)' }}>{supply.source_file}</p>
          </div>
        )}
      </div>

      {supply.note && (
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-muted)', fontStyle: 'italic' }}>
          {supply.note}
        </p>
      )}

      {/* Close prompt (inline) */}
      {closePromptOpen && (
        <div style={{ padding: '12px', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '14px' }}>Закрыть план? Укажите примечание (необязательно):</p>
          <textarea
            className="input"
            style={{ width: '100%', resize: 'vertical', minHeight: '60px', marginBottom: '8px' }}
            value={closeNote}
            onChange={(e) => setCloseNote(e.target.value)}
            placeholder="Причина закрытия или итог..."
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-primary"
              onClick={() => closeMutation.mutate(closeNote.trim() || null)}
              disabled={closeMutation.isPending}
            >
              {closeMutation.isPending ? 'Закрываем...' : 'Подтвердить'}
            </button>
            <button className="btn" onClick={() => { setClosePromptOpen(false); setCloseNote(''); }}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Items comparison table */}
      <div>
        <h3 style={{ margin: '0 0 8px' }}>Позиции (план / факт)</h3>
        {items.length === 0 ? (
          <p style={{ color: 'var(--color-muted)' }}>Нет позиций</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Наименование</th>
                <th style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>Запланировано</th>
                <th style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>Факт</th>
                <th style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>Разница</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const fact = factBySkuFromReceipts[item.sku] || 0;
                const planned = Number(item.planned_quantity) || 0;
                const diff = fact - planned;
                return (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{item.sku}</td>
                    <td>{item.product_name || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{planned}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fact}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: diffColor(diff) }}>
                      {diff === 0 ? '0' : diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Linked receipts */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ margin: 0 }}>Связанные приёмки</h3>
          {receipts.length > 0 && supply.status !== 'closed' && (
            <button
              className="btn"
              onClick={() => {
                setCorrReceiptId(receipts[0].id);
                setCorrType('receipt');
                setCorrOpen(true);
              }}
            >
              + Корректировка
            </button>
          )}
        </div>
        {receipts.length === 0 ? (
          <p style={{ color: 'var(--color-muted)' }}>Нет связанных приёмок</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Дата</th>
                <th style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>Количество</th>
                <th>Примечание / Позиции</th>
                <th style={{ width: '80px' }} />
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <>
                  <tr key={receipt.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>#{receipt.id}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{receipt.operation_date || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {receipt.total_quantity ?? '—'}
                    </td>
                    <td style={{ color: receipt.note ? undefined : 'var(--color-muted)' }}>
                      {receipt.note || '—'}
                    </td>
                    <td />
                  </tr>
                  {(receipt.corrections || []).map((corr) => {
                    const isReturn = corr.type_code === 'receipt_return';
                    const signColor = isReturn ? 'var(--color-danger)' : 'var(--color-success)';
                    return (
                      <tr key={`corr-${corr.id}`} style={{ opacity: 0.85 }}>
                        <td style={{ fontFamily: 'var(--font-mono)', paddingLeft: '24px', color: 'var(--color-muted)', fontSize: '12px' }}>
                          ↳ #{corr.id}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{corr.operation_date || '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px', color: signColor }}>
                          {isReturn ? '↩ Возврат' : '+ Доприёмка'}
                        </td>
                        <td>
                          {(corr.items || []).map((ci, ci_idx) => (
                            <span key={ci_idx} style={{ display: 'inline-block', marginRight: '8px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                              <span style={{ color: signColor }}>{isReturn ? '-' : '+'}{Math.abs(ci.quantity)}</span>
                              {' '}<span style={{ color: 'var(--color-muted)' }}>{ci.sku}</span>
                            </span>
                          ))}
                          {(corr.items || []).length === 0 && (
                            <span style={{ color: 'var(--color-muted)', fontSize: '12px' }}>{corr.note || '—'}</span>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            className="btn"
                            style={{ padding: '2px 8px', fontSize: '12px', marginRight: '4px' }}
                            title="Редактировать"
                            onClick={() => openEditCorr(corr, receipt.id)}
                          >
                            ✎
                          </button>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '2px 8px', fontSize: '12px' }}
                            title="Удалить"
                            disabled={deleteCorrMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`Удалить корректировку #${corr.id}?`)) {
                                deleteCorrMutation.mutate(corr.id);
                              }
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Correction modal */}
      <Modal
        open={corrOpen}
        onClose={closeCorrModal}
        title={corrEditId !== null
          ? `Редактировать корректировку #${corrEditId}`
          : `Корректировка к поставке «${supply?.title || ''}»`}
        size="lg"
        footer={
          <>
            <button className="btn-cancel" type="button" onClick={closeCorrModal}>Закрыть</button>
            <button className="btn btn-primary" type="button" onClick={submitCorrection}
              disabled={corrMutation.isPending || editCorrMutation.isPending}>
              {corrMutation.isPending || editCorrMutation.isPending
                ? (corrEditId !== null ? 'Сохраняем...' : 'Проводим...')
                : (corrEditId !== null ? 'Сохранить' : 'Провести')}
            </button>
          </>
        }
      >
        {/* Type — hidden in edit mode (type is immutable) */}
        {corrEditId === null && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--space-3)' }}>
            <button type="button" className={`btn ${corrType === 'receipt' ? 'btn-primary' : ''}`}
              onClick={() => setCorrType('receipt')}>
              + Добавить недовоз
            </button>
            <button type="button" className={`btn ${corrType === 'receipt_return' ? 'btn-danger' : ''}`}
              onClick={() => setCorrType('receipt_return')}>
              ↩ Вернуть лишнее
            </button>
          </div>
        )}

        {/* Receipt selector (if multiple) */}
        {(supply?.operations || []).length > 1 && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label>
              Приёмка
              <select className="input" value={corrReceiptId || ''}
                onChange={(e) => setCorrReceiptId(Number(e.target.value) || null)}>
                {(supply.operations || []).map((r) => (
                  <option key={r.id} value={r.id}>#{r.id} от {r.operation_date || '?'} ({r.total_quantity} шт.)</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Date + note */}
        <div className="form-row two-cols" style={{ marginBottom: 'var(--space-3)' }}>
          <label>
            Дата
            <input className="input" type="date" value={corrDate}
              onChange={(e) => setCorrDate(e.target.value)} />
          </label>
          <label>
            Примечание
            <input className="input" value={corrNote}
              onChange={(e) => setCorrNote(e.target.value)} />
          </label>
        </div>

        {/* Reason */}
        {corrReasons.length > 0 && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label>
              Причина
              <select className="input" value={corrReasonId || ''}
                onChange={(e) => {
                const reasonId = e.target.value ? Number(e.target.value) : null;
                setCorrReasonId(reasonId);
                if (reasonId) {
                  const reason = corrReasons.find((r) => r.id === reasonId);
                  if (reason?.code === REASON_EXCESS_CODE) setCorrType('receipt_return');
                  else if (reason?.code === REASON_SHORTAGE_CODE) setCorrType('receipt');
                }
              }}>
                <option value="">— не указана —</option>
                {corrReasons.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Items */}
        {(() => {
          const allProducts = productsQuery.data || [];
          const reasonCode = corrReasons.find((r) => r.id === corrReasonId)?.code || '';
          const isSurplusReason = reasonCode === REASON_EXCESS_CODE;
          const isShortageReason = reasonCode === REASON_SHORTAGE_CODE;
          const suggestedMap = isSurplusReason
            ? corrPlanDiff?.surpluses
            : isShortageReason
              ? corrPlanDiff?.shortages
              : null;
          const suggestedLabel = isSurplusReason ? '★ Рекомендуемые (излишки)' : '★ Рекомендуемые (недостача)';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <p style={{ margin: 0, fontWeight: 500 }}>Позиции:</p>
              {corrItems.map((ci, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <ProductCombobox
                    products={allProducts}
                    value={ci.productId}
                    suggestedMap={suggestedMap}
                    suggestedLabel={suggestedLabel}
                    onChange={(prod, autoQty) => {
                      setCorrItems((prev) => prev.map((item, i) =>
                        i === idx ? {
                          ...item,
                          productId: prod.id,
                          productName: prod.name,
                          productSku: prod.sku,
                          quantity: autoQty !== null ? autoQty : item.quantity,
                        } : item
                      ));
                    }}
                  />
                  <input className="input" type="number" min={1} style={{ width: 80 }}
                    value={ci.quantity}
                    onChange={(e) => setCorrItems((prev) => prev.map((item, i) =>
                      i === idx ? { ...item, quantity: Number(e.target.value) } : item
                    ))} />
                  <button className="btn btn-danger" type="button" style={{ padding: '4px 8px' }}
                    onClick={() => setCorrItems((prev) => prev.filter((_, i) => i !== idx))}>
                    ✕
                  </button>
                </div>
              ))}
              <button className="btn" type="button"
                onClick={() => setCorrItems((prev) => [...prev, { productId: null, productName: '', productSku: '', quantity: 1 }])}>
                + Добавить позицию
              </button>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
