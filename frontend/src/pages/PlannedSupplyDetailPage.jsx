import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';
import { useUiStore } from '../store/useUiStore.js';

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

  const supplyQuery = useQuery({
    queryKey: ['planned-supply', id],
    queryFn: () => services.getPlannedSupplyById(id),
  });

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

  // Build fact quantities map from receipts
  const factBySkuFromReceipts = useMemo(() => {
    if (!supply?.receipts?.length) return {};
    const map = {};
    for (const receipt of supply.receipts) {
      const receiptItems = receipt.items || receipt.corrections || [];
      for (const item of receiptItems) {
        const sku = item.sku || item.productSKU || item.product_sku;
        if (!sku) continue;
        const qty = Number(item.quantity || item.qty || 0);
        map[sku] = (map[sku] || 0) + qty;
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
  const receipts = supply.receipts || [];

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
        <h3 style={{ margin: '0 0 8px' }}>Связанные приёмки</h3>
        {receipts.length === 0 ? (
          <p style={{ color: 'var(--color-muted)' }}>Нет связанных приёмок</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Дата</th>
                <th style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>Количество</th>
                <th>Примечание</th>
                <th></th>
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
                    <td>
                      <Link to="/receipt" style={{ fontSize: '13px' }}>
                        Приёмка #{receipt.id}
                      </Link>
                    </td>
                  </tr>
                  {(receipt.corrections || []).map((corr) => (
                    <tr key={`corr-${corr.id}`} style={{ opacity: 0.75 }}>
                      <td style={{ fontFamily: 'var(--font-mono)', paddingLeft: '24px', color: 'var(--color-muted)' }}>
                        ↳ #{corr.id}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{corr.operation_date || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {corr.total_quantity ?? '—'}
                      </td>
                      <td style={{ color: corr.note ? undefined : 'var(--color-muted)' }}>{corr.note || '—'}</td>
                      <td></td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
