import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';
import { useUiStore } from '../store/useUiStore.js';
import Modal from '../components/Modal.jsx';
import { parseSupplyXlsx } from '../utils/xlsxParser.js';

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

function emptyItem() {
  return { sku: '', product_name: '', planned_quantity: '' };
}

export default function PlannedSuppliesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState('manual');
  const [statusFilter, setStatusFilter] = useState('all');

  // Manual form state
  const [title, setTitle] = useState('');
  const [supplier, setSupplier] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([emptyItem()]);

  // Excel state
  const [excelItems, setExcelItems] = useState([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelTitle, setExcelTitle] = useState('');
  const [excelSupplier, setExcelSupplier] = useState('');
  const [excelDate, setExcelDate] = useState('');
  const [excelNote, setExcelNote] = useState('');

  const suppliesQuery = useQuery({
    queryKey: ['planned-supplies', statusFilter],
    queryFn: () =>
      services.getPlannedSupplies({
        includeClosed: statusFilter === 'all' || statusFilter === 'closed',
        size: 200,
      }),
  });

  const filtered = useMemo(() => {
    const raw = suppliesQuery.data?.items || suppliesQuery.data || [];
    if (statusFilter === 'all') return raw;
    return raw.filter((s) => s.status === statusFilter);
  }, [suppliesQuery.data, statusFilter]);

  const createMutation = useMutation({
    mutationFn: (payload) => services.createPlannedSupply(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-supplies'] });
      pushToast('План создан', 'success');
      setCreateOpen(false);
    },
    onError: (err) => pushToast(err.message || 'Ошибка', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => services.deletePlannedSupply(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-supplies'] });
      pushToast('План удалён', 'success');
    },
    onError: (err) => pushToast(err.message || 'Нельзя удалить план с привязанными приёмками', 'error'),
  });

  function resetForm() {
    setTitle('');
    setSupplier('');
    setPlannedDate('');
    setNote('');
    setItems([emptyItem()]);
    setExcelItems([]);
    setExcelFileName('');
    setExcelTitle('');
    setExcelSupplier('');
    setExcelDate('');
    setExcelNote('');
  }

  function openCreate(mode) {
    resetForm();
    setCreateMode(mode);
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    resetForm();
  }

  function handleItemChange(index, field, value) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleExcelFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await parseSupplyXlsx(file, { pushToast });
    if (!result) return;
    setExcelItems(result.items);
    setExcelFileName(result.fileName);
    const baseName = result.fileName.replace(/\.[^/.]+$/, '');
    setExcelTitle(baseName);
  }

  function handleSubmit() {
    const isExcel = createMode === 'excel';
    const finalTitle = (isExcel ? excelTitle : title).trim();
    if (!finalTitle) {
      pushToast('Введите название плана', 'error');
      return;
    }
    const finalItems = isExcel
      ? excelItems.map((item) => ({ sku: item.sku, product_name: null, planned_quantity: item.qty }))
      : items
          .filter((item) => item.sku.trim())
          .map((item) => ({
            sku: item.sku.trim(),
            product_name: item.product_name.trim() || null,
            planned_quantity: Number(item.planned_quantity) || 0,
          }));
    if (!finalItems.length) {
      pushToast('Добавьте хотя бы одну позицию', 'error');
      return;
    }
    const payload = {
      title: finalTitle,
      supplier: (isExcel ? excelSupplier : supplier).trim() || null,
      planned_date: (isExcel ? excelDate : plannedDate) || null,
      note: (isExcel ? excelNote : note).trim() || null,
      source_file: isExcel ? excelFileName || null : null,
      items: finalItems,
    };
    createMutation.mutate(payload);
  }

  const filterLabels = { all: 'Все', planned: STATUS_LABELS.planned, partial: STATUS_LABELS.partial, matched: STATUS_LABELS.matched, closed: STATUS_LABELS.closed };

  return (
    <div className="stack">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Запланированные поставки</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={() => openCreate('excel')}>Из Excel</button>
          <button className="btn btn-primary" onClick={() => openCreate('manual')}>Создать</button>
        </div>
      </div>

      <div className="toolbar" style={{ gap: '4px' }}>
        {['all', 'planned', 'partial', 'matched', 'closed'].map((s) => (
          <button
            key={s}
            className={`btn${statusFilter === s ? ' btn-primary' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {filterLabels[s]}
          </button>
        ))}
      </div>

      {suppliesQuery.isLoading && <p style={{ color: 'var(--color-muted)' }}>Загрузка...</p>}
      {suppliesQuery.isError && <p style={{ color: 'var(--color-danger)' }}>Ошибка загрузки</p>}

      {!suppliesQuery.isLoading && !suppliesQuery.isError && (
        <table className="table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Поставщик</th>
              <th>Дата</th>
              <th>Статус</th>
              <th>Позиций</th>
              <th>Приёмок</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: 'var(--color-muted)', textAlign: 'center' }}>
                  Нет поставок
                </td>
              </tr>
            )}
            {filtered.map((supply) => (
              <tr
                key={supply.id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/planned-supplies/${supply.id}`)}
              >
                <td>{supply.title}</td>
                <td>{supply.supplier || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{supply.planned_date || '—'}</td>
                <td>{statusBadge(supply.status)}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{supply.items?.length ?? supply.item_count ?? 0}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{supply.receipt_count ?? 0}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-danger"
                    style={{ padding: '2px 8px', fontSize: '12px' }}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm('Удалить план?')) deleteMutation.mutate(supply.id);
                    }}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title={createMode === 'excel' ? 'Создать план из Excel' : 'Создать план поставки'}
        size="lg"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={closeCreate}>Отмена</button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </button>
          </div>
        }
      >
        {createMode === 'manual' ? (
          <div className="stack">
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                Название *
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Название плана"
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                  Поставщик
                </label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Поставщик"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                  Плановая дата
                </label>
                <input
                  className="input"
                  type="date"
                  style={{ width: '100%' }}
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                Примечание
              </label>
              <textarea
                className="input"
                style={{ width: '100%', resize: 'vertical', minHeight: '60px' }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Примечание (необязательно)"
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-muted)' }}>Позиции</span>
                <button className="btn" style={{ fontSize: '12px', padding: '2px 10px' }} onClick={addItem}>
                  + Добавить позицию
                </button>
              </div>
              <table className="table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Наименование</th>
                    <th style={{ width: '110px' }}>Количество</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          className="input"
                          style={{ width: '100%' }}
                          value={item.sku}
                          onChange={(e) => handleItemChange(index, 'sku', e.target.value)}
                          placeholder="SKU"
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          style={{ width: '100%' }}
                          value={item.product_name}
                          onChange={(e) => handleItemChange(index, 'product_name', e.target.value)}
                          placeholder="Наименование"
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                          value={item.planned_quantity}
                          onChange={(e) => handleItemChange(index, 'planned_quantity', e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '2px 6px', fontSize: '12px' }}
                          onClick={() => removeItem(index)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="stack">
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                Файл Excel
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelFile}
                style={{ display: 'block' }}
              />
              {excelFileName && (
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-muted)' }}>
                  {excelFileName} — {excelItems.length} позиций
                </p>
              )}
            </div>

            {excelItems.length > 0 && (
              <>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                    Название *
                  </label>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    value={excelTitle}
                    onChange={(e) => setExcelTitle(e.target.value)}
                    placeholder="Название плана"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                      Поставщик
                    </label>
                    <input
                      className="input"
                      style={{ width: '100%' }}
                      value={excelSupplier}
                      onChange={(e) => setExcelSupplier(e.target.value)}
                      placeholder="Поставщик"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                      Плановая дата
                    </label>
                    <input
                      className="input"
                      type="date"
                      style={{ width: '100%' }}
                      value={excelDate}
                      onChange={(e) => setExcelDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                    Примечание
                  </label>
                  <textarea
                    className="input"
                    style={{ width: '100%', resize: 'vertical', minHeight: '60px' }}
                    value={excelNote}
                    onChange={(e) => setExcelNote(e.target.value)}
                    placeholder="Примечание (необязательно)"
                  />
                </div>

                <div>
                  <p style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--color-muted)' }}>
                    Предпросмотр позиций ({excelItems.length})
                  </p>
                  <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                    <table className="table" style={{ fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>Количество</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excelItems.map((item, idx) => (
                          <tr key={idx}>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{item.sku}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{item.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
