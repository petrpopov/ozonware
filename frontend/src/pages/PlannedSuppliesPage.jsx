import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';
import { useUiStore } from '../store/useUiStore.js';
import Modal from '../components/Modal.jsx';
import { parseSupplyXlsx } from '../utils/xlsxParser.js';
import { EditIcon, TrashIcon } from '../components/Icons.jsx';

function categoryClass(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('petg')) return 'cat petg';
  if (v.includes('basic')) return 'cat basic';
  if (v.includes('matte')) return 'cat matte';
  if (v.includes('lite')) return 'cat lite';
  return 'cat';
}

function getCategoryValue(product) {
  if (!product?.custom_fields) return null;
  const cf = product.custom_fields.find(
    (f) => String(f.name).toLowerCase().includes('категор') || String(f.name).toLowerCase() === 'category'
  );
  return cf?.value || null;
}

const STATUS_LABELS = {
  planned: 'Запланирован',
  partial: 'Частично',
  matched: 'Сошлось',
  closed: 'Закрыт',
};

const STATUS_COLORS = {
  planned: 'var(--color-info)',
  partial: 'var(--color-warning)',
  matched: 'var(--color-success)',
  closed: 'var(--text-muted)',
};

const PILL_VARIANT = {
  planned: 'planned',
  partial: 'partial',
  matched: 'closed',
  closed: 'closed',
  shipped: 'shipped',
  returned: 'returned',
};

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  const variant = PILL_VARIANT[status] || '';
  return (
    <span className={'pill' + (variant ? ` ${variant}` : '')}>
      {variant && <span className="pill-dot" />}
      {label}
    </span>
  );
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

  const [statusKey, setStatusKey] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'purchaseDate', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Manual form state
  const [title, setTitle] = useState('');
  const [supplier, setSupplier] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([emptyItem()]);

  // Excel state
  const [excelItems, setExcelItems] = useState([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelTitle, setExcelTitle] = useState('');
  const [excelSupplier, setExcelSupplier] = useState('');
  const [excelPurchaseDate, setExcelPurchaseDate] = useState('');
  const [excelExpectedDate, setExcelExpectedDate] = useState('');
  const [excelNote, setExcelNote] = useState('');

  const rsqlFilter = statusKey === 'all' ? null : `status==${statusKey}`;
  const sortStr = `${sort.key},${sort.dir}`;

  const productsQuery = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => services.getProducts('', { includeInactive: true }),
  });

  const suppliesQuery = useQuery({
    queryKey: ['planned-supplies', rsqlFilter, sortStr, page, pageSize],
    queryFn: () => services.getPlannedSuppliesPage({
      filter: rsqlFilter,
      page: page - 1,
      size: pageSize,
      sort: sortStr,
    }),
  });

  const rawSupplies = suppliesQuery.data?.items || [];
  const supplies = useMemo(() => {
    if (!search.trim()) return rawSupplies;
    const q = search.trim().toLowerCase();
    return rawSupplies.filter((s) =>
      String(s.title || '').toLowerCase().includes(q) ||
      String(s.supplier || '').toLowerCase().includes(q)
    );
  }, [rawSupplies, search]);
  const total = Number(suppliesQuery.data?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSort = (key) => {
    setPage(1);
    setSort((prev) => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }
    );
  };

  const sortThClass = (key) => 'sortable' + (sort.key === key ? ' sorted' : '');
  const renderSortMark = (key) => {
    if (sort.key !== key) return '↕';
    return sort.dir === 'asc' ? '▲' : '▼';
  };

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
    setPurchaseDate('');
    setExpectedDate('');
    setNote('');
    setItems([emptyItem()]);
    setExcelItems([]);
    setExcelFileName('');
    setExcelTitle('');
    setExcelSupplier('');
    setExcelPurchaseDate('');
    setExcelExpectedDate('');
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
    const productsMap = new Map(
      (productsQuery.data || []).map((p) => [p.sku.trim().toLowerCase(), p])
    );
    const enriched = result.items.map((it) => {
      const product = productsMap.get(it.sku.trim().toLowerCase()) || null;
      const found = Boolean(product);
      const activating = found && !product.is_active;
      return { ...it, product, found, activating };
    });
    setExcelItems(enriched);
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
      ? excelItems.map((item) => ({ sku: item.sku, product_name: item.product?.name ?? null, planned_quantity: item.qty }))
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
      purchase_date: (isExcel ? excelPurchaseDate : purchaseDate) || null,
      expected_date: (isExcel ? excelExpectedDate : expectedDate) || null,
      note: (isExcel ? excelNote : note).trim() || null,
      source_file: isExcel ? excelFileName || null : null,
      items: finalItems,
    };
    createMutation.mutate(payload);
  }

  const filterLabels = { all: 'Все', planned: STATUS_LABELS.planned, partial: STATUS_LABELS.partial, matched: STATUS_LABELS.matched, closed: STATUS_LABELS.closed };

  const statusCounts = useMemo(() => {
    const all = suppliesQuery.data?.items || [];
    const by = (k) => all.filter((x) => x.status === k).length;
    return {
      all: all.length,
      planned: by('planned'),
      partial: by('partial'),
      matched: by('matched'),
      closed: by('closed'),
    };
  }, [suppliesQuery.data]);

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-title-cluster">
          <h1 className="page-title">Запланированные поставки</h1>
          <div className="page-subtitle">Заказы у поставщиков и их состыковка с приходами</div>
        </div>
        <div className="kpi-strip">
          <div className="kpi"><div className="kpi-label">Всего</div><div className="kpi-value">{statusCounts.all}</div></div>
          <div className={'kpi' + (statusCounts.planned ? ' warn' : '')}><div className="kpi-label">Ожидается</div><div className="kpi-value">{statusCounts.planned + statusCounts.partial}</div></div>
          <div className="kpi"><div className="kpi-label">Закрыто</div><div className="kpi-value">{statusCounts.closed}</div></div>
        </div>
      </div>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => openCreate('manual')}>+ Создать</button>
        <button className="btn" onClick={() => openCreate('excel')}>Из Excel</button>
        <input
          className="input"
          placeholder="Поиск по названию, поставщику…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 320, marginLeft: 8 }}
        />
      </div>

      <div className="chipbar">
        <span className="chipbar-label">Статус</span>
        {['all', 'planned', 'partial', 'matched', 'closed'].map((s) => (
          <div
            key={s}
            className={'chip' + (statusKey === s ? ' active' : '')}
            onClick={() => { setStatusKey(s); setPage(1); }}
          >
            <span>{filterLabels[s]}</span>
            <span className="chip-count">{statusCounts[s]}</span>
          </div>
        ))}
      </div>

      {suppliesQuery.isLoading && <p style={{ color: 'var(--color-muted)' }}>Загрузка...</p>}
      {suppliesQuery.isError && <p style={{ color: 'var(--color-danger)' }}>Ошибка загрузки</p>}

      {!suppliesQuery.isLoading && !suppliesQuery.isError && (
        <>
          <div className="toolbar history-pager">
            <label className="history-pager-label">
              Показывать:
              <select
                className="input"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={200}>200</option>
              </select>
            </label>
            <span className="history-pager-range">
              {total === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`} из {total}
            </span>
            <button className="btn" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Назад</button>
            <span className="history-pager-range">Стр. {page} / {totalPages}</span>
            <button className="btn" type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Вперед</button>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th className={sortThClass('title')} onClick={() => toggleSort('title')}>Название <span>{renderSortMark('title')}</span></th>
                <th className={sortThClass('supplier')} onClick={() => toggleSort('supplier')}>Поставщик <span>{renderSortMark('supplier')}</span></th>
                <th className={sortThClass('purchaseDate')} onClick={() => toggleSort('purchaseDate')}>Закупка <span>{renderSortMark('purchaseDate')}</span></th>
                <th className={sortThClass('expectedDate')} onClick={() => toggleSort('expectedDate')}>Ожидается <span>{renderSortMark('expectedDate')}</span></th>
                <th className={sortThClass('status')} onClick={() => toggleSort('status')}>Статус <span>{renderSortMark('status')}</span></th>
                <th>Позиций</th>
                <th>Приёмок</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {supplies.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--color-muted)', textAlign: 'center' }}>
                    Нет поставок
                  </td>
                </tr>
              )}
              {supplies.map((supply) => (
                <tr
                  key={supply.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/planned-supplies/${supply.id}`)}
                >
                  <td>{supply.title}</td>
                  <td>{supply.supplier || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{supply.purchase_date || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{supply.expected_date || '—'}</td>
                  <td>{statusBadge(supply.status)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{supply.item_count ?? 0}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{supply.receipt_count ?? 0}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button
                        className="icon-btn"
                        aria-label="Редактировать"
                        title="Редактировать"
                        onClick={() => navigate(`/planned-supplies/${supply.id}`)}
                      >
                        <EditIcon />
                      </button>
                      <button
                        className="icon-btn danger"
                        aria-label="Удалить"
                        title="Удалить"
                        disabled={deleteMutation.isPending}
                        onClick={() => { if (window.confirm('Удалить план?')) deleteMutation.mutate(supply.id); }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
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
                  Дата закупки
                </label>
                <input
                  className="input"
                  type="date"
                  style={{ width: '100%' }}
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                  Ожидается
                </label>
                <input
                  className="input"
                  type="date"
                  style={{ width: '100%' }}
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
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
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--color-muted)' }}>
                Файл Excel
              </label>
              <label className="btn import-file-btn">
                Выберите файл
                <input
                  className="hidden-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelFile}
                />
              </label>
              {excelFileName && (
                <div className="import-file-name">
                  {excelFileName} — {excelItems.length} позиций
                </div>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
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
                      Дата закупки
                    </label>
                    <input
                      className="input"
                      type="date"
                      style={{ width: '100%' }}
                      value={excelPurchaseDate}
                      onChange={(e) => setExcelPurchaseDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                      Ожидается
                    </label>
                    <input
                      className="input"
                      type="date"
                      style={{ width: '100%' }}
                      value={excelExpectedDate}
                      onChange={(e) => setExcelExpectedDate(e.target.value)}
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
                    Предпросмотр позиций ({excelItems.length}) — всего{' '}
                    <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {excelItems.reduce((sum, it) => sum + (Number(it.qty) || 0), 0)}
                    </strong>{' '}
                    шт.
                  </p>
                  <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                    <table className="table" style={{ fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Наименование</th>
                          <th>Категория</th>
                          <th style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>Количество</th>
                          <th>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excelItems.map((entry, idx) => {
                          const cat = getCategoryValue(entry.product);
                          return (
                            <tr key={idx} className={!entry.found ? 'match-warning' : entry.activating ? 'match-catalog' : ''}>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{entry.sku}</td>
                              <td>{entry.product?.name || '—'}</td>
                              <td>{cat ? <span className={categoryClass(cat)}>{cat}</span> : '—'}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{entry.qty}</td>
                              <td>
                                {!entry.found && <span className="match-pill match-pill-warning">Не найден</span>}
                                {entry.found && !entry.activating && <span className="match-pill match-pill-found">Найден</span>}
                                {entry.found && entry.activating && <span className="match-pill match-pill-catalog">Из справочника</span>}
                              </td>
                            </tr>
                          );
                        })}
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
