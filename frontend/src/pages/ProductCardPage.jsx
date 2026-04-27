import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { services } from '../api/services.js';
import { useUiStore } from '../store/useUiStore.js';
import { useRouteRefetch } from '../hooks/useRouteRefetch.js';
import { FIELD_KIND_OZON_SKU, FIELD_NAME_OZON_PHOTO } from '../constants/fieldKinds.js';
import HexColorInput from '../components/HexColorInput.jsx';

const emptyForm = {
  id: null,
  name: '',
  sku: '',
  quantity: 0,
  description: '',
  default_box_size: '',
  custom_fields: []
};

function normalizeCustomFields(product, fields) {
  const map = new Map((product.custom_fields || []).map((f) => [f.name, f]));
  return fields.map((field) => ({
    name: field.name,
    value: map.get(field.name)?.value ?? '',
    type: field.type,
    required: !!field.required
  }));
}

export default function ProductCardPage() {
  const { id } = useParams();
  const productId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [timelineLimit, setTimelineLimit] = useState('100');
  const [timelinePage, setTimelinePage] = useState(1);

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => services.getProductById(productId),
    enabled: Number.isFinite(productId)
  });
  const fieldsQuery = useQuery({
    queryKey: ['product-fields'],
    queryFn: services.getProductFields
  });
  const usageQuery = useQuery({
    queryKey: ['product-usage', productId],
    queryFn: () => services.getProductUsage(productId),
    enabled: Number.isFinite(productId)
  });
  const productStatsQuery = useQuery({
    queryKey: ['product-extended-stats', productId],
    queryFn: () => services.getProductOrderStats(productId),
    enabled: Number.isFinite(productId)
  });
  const timelineOffset = timelineLimit === 'all' ? 0 : (timelinePage - 1) * Number(timelineLimit);
  const timelineQuery = useQuery({
    queryKey: ['product-timeline', productId, timelineLimit, timelineOffset],
    queryFn: () =>
      services.getProductTimeline(productId, {
        limit: timelineLimit === 'all' ? undefined : timelineLimit,
        offset: timelineOffset,
        all: timelineLimit === 'all'
      }),
    enabled: Number.isFinite(productId)
  });

  useRouteRefetch(productQuery.refetch);
  useRouteRefetch(fieldsQuery.refetch);
  useRouteRefetch(usageQuery.refetch);
  useRouteRefetch(productStatsQuery.refetch);
  useRouteRefetch(timelineQuery.refetch);

  const fields = useMemo(
    () =>
      (fieldsQuery.data || [])
        .filter((f) => f.kind !== FIELD_KIND_OZON_SKU)
        .map((field) => ({
          ...field,
          required: !!field.required,
          options: Array.isArray(field.options) ? field.options : []
        })),
    [fieldsQuery.data]
  );

  useEffect(() => {
    if (!productQuery.data || !fields.length) return;
    const product = productQuery.data;
    setForm({
      id: product.id,
      name: product.name || '',
      sku: product.sku || '',
      quantity: Number(product.quantity || 0),
      description: product.description || '',
      default_box_size: product.default_box_size != null ? String(product.default_box_size) : '',
      custom_fields: normalizeCustomFields(product, fields)
    });
    setErrors({});
  }, [productQuery.data, fields]);

  const updateMutation = useMutation({
    mutationFn: (payload) => services.updateProduct(productId, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      queryClient.invalidateQueries({ queryKey: ['product-extended-stats', productId] });
      queryClient.invalidateQueries({ queryKey: ['product-timeline', productId] });
      setForm((prev) => ({
        ...prev,
        id: updated.id,
        name: updated.name || '',
        sku: updated.sku || '',
        quantity: Number(updated.quantity || 0),
        description: updated.description || '',
        default_box_size: updated.default_box_size != null ? String(updated.default_box_size) : '',
        custom_fields: normalizeCustomFields(updated, fields)
      }));
      pushToast('Товар сохранен', 'success');
    },
    onError: (error) => pushToast(error.message || 'Ошибка сохранения', 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: () => services.deleteProduct(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      pushToast('Товар удален', 'success');
      navigate('/products');
    },
    onError: (error) => pushToast(error.message || 'Ошибка удаления', 'error')
  });

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Введите название товара';
    if (!form.sku.trim()) next.sku = 'Введите SKU';
    form.custom_fields.forEach((field, idx) => {
      if (field.required && !String(field.value ?? '').trim()) {
        next[`custom_${idx}`] = `Поле "${field.name}" обязательно`;
      }
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (event) => {
    event.preventDefault();
    if (!validate()) return;
    updateMutation.mutate({
      name: form.name.trim(),
      sku: form.sku.trim(),
      quantity: Number(form.quantity || 0),
      description: form.description || '',
      default_box_size: form.default_box_size !== '' ? Number(form.default_box_size) : null,
      custom_fields: form.custom_fields
    });
  };

  const canDelete = usageQuery.data?.can_delete === true;
  const operationsCount = Number(usageQuery.data?.operations_count || 0);
  const photoField = (form.custom_fields || []).find((field) => String(field.name || '').trim() === FIELD_NAME_OZON_PHOTO);
  const photo = String(photoField?.value || '').trim();
  const extStats = productStatsQuery.data || {};
  const warehouse = extStats.warehouse || {};
  const orders = extStats.orders || {};
  const timelineItems = timelineQuery.data?.items || [];
  const timelineTotal = Number(timelineQuery.data?.total || 0);
  const effectiveLimit = timelineLimit === 'all' ? timelineTotal || timelineItems.length : Number(timelineLimit);
  const timelinePages =
    timelineLimit === 'all' ? 1 : Math.max(1, Math.ceil(timelineTotal / Math.max(1, effectiveLimit)));
  const timelineRangeStart = timelineTotal === 0 ? 0 : timelineOffset + 1;
  const timelineRangeEnd = timelineTotal === 0 ? 0 : Math.min(timelineOffset + timelineItems.length, timelineTotal);

  if (!Number.isFinite(productId)) return <p>Некорректный ID товара</p>;
  if (productQuery.isLoading || fieldsQuery.isLoading || usageQuery.isLoading || productStatsQuery.isLoading || timelineQuery.isLoading) return <p>Загрузка...</p>;
  if (productQuery.isError) return <p>Не удалось загрузить товар</p>;

  return (
    <div className="stack">
      <div className="page-head">
        <button className="btn btn-ghost" type="button" onClick={() => navigate('/products')} style={{ marginRight: 8 }}>← К товарам</button>
        <div className="page-title-cluster">
          <h1 className="page-title">{form.name || `Товар #${form.id}`}</h1>
          <div className="page-subtitle">Карточка товара · операций: {operationsCount}</div>
        </div>
      </div>

      <nav className="breadcrumbs" aria-label="Навигация" style={{ padding: '0 4px' }}>
        <button type="button" className="breadcrumbs-link" onClick={() => navigate('/products')}>Товары</button>
        <span className="breadcrumbs-sep">/</span>
        <span className="breadcrumbs-current">{form.name || `#${form.id}`}</span>
      </nav>

      <section className="card">
        <h3>Карточка товара #{form.id}</h3>
        <div className="import-result">
          Операций по товару: <strong>{operationsCount}</strong> · Удаление: <strong>{canDelete ? 'доступно' : 'недоступно'}</strong>
        </div>
        <form onSubmit={submit} className="form-grid" noValidate>
          <label>
            ID
            <input className="input" value={String(form.id ?? '')} disabled />
          </label>
          <label>
            Фото
            <div className="product-card-photo-wrap">
              {photo ? <img className="product-card-photo" src={photo} alt={form.name || 'product'} loading="lazy" /> : <span>—</span>}
            </div>
          </label>
          <label>
            Название*
            <input
              className={`input ${errors.name ? 'input-error' : ''}`}
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            />
            <span className={`field-error ${errors.name ? '' : 'field-error-placeholder'}`}>{errors.name || ' '}</span>
          </label>
          <label>
            SKU*
            <input
              className={`input ${errors.sku ? 'input-error' : ''}`}
              value={form.sku}
              onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))}
            />
            <span className={`field-error ${errors.sku ? '' : 'field-error-placeholder'}`}>{errors.sku || ' '}</span>
          </label>
          <label>
            Количество
            <input
              className="input"
              type="number"
              value={form.quantity}
              onChange={(e) => setForm((s) => ({ ...s, quantity: e.target.value }))}
            />
          </label>
          <label>
            Шт в коробке (по умолчанию)
            <input
              className="input"
              type="number"
              min="1"
              placeholder="Не задано"
              value={form.default_box_size}
              onChange={(e) => setForm((s) => ({ ...s, default_box_size: e.target.value }))}
            />
          </label>
          <label>
            Описание
            <textarea
              className="input"
              value={form.description || ''}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            />
          </label>

          {fields.map((field, idx) => {
            const value = form.custom_fields?.[idx]?.value ?? '';
            const errorKey = `custom_${idx}`;
            return (
              <label key={field.id || field.name}>
                {field.name}{field.required ? '*' : ''}
                {field.type === 'select' ? (
                  <select
                    className={`input ${errors[errorKey] ? 'input-error' : ''}`}
                    value={value}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        custom_fields: (s.custom_fields || []).map((item, itemIdx) =>
                          itemIdx === idx ? { ...item, value: e.target.value } : item
                        )
                      }))
                    }
                  >
                    <option value="">-- Выберите --</option>
                    {(field.options || []).map((option) => (
                      <option key={`${field.name}-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'color' ? (
                  <HexColorInput
                    className={`input ${errors[errorKey] ? 'input-error' : ''}`}
                    value={value}
                    onChange={(nextValue) =>
                      setForm((s) => ({
                        ...s,
                        custom_fields: (s.custom_fields || []).map((item, itemIdx) =>
                          itemIdx === idx ? { ...item, value: nextValue } : item
                        )
                      }))
                    }
                  />
                ) : (
                  <input
                    className={`input ${errors[errorKey] ? 'input-error' : ''}`}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={value}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        custom_fields: (s.custom_fields || []).map((item, itemIdx) =>
                          itemIdx === idx ? { ...item, value: e.target.value } : item
                        )
                      }))
                    }
                  />
                )}
                <span className={`field-error ${errors[errorKey] ? '' : 'field-error-placeholder'}`}>
                  {errors[errorKey] || ' '}
                </span>
              </label>
            );
          })}

          <div className="modal-actions">
            <button className="btn btn-primary" type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              className="btn btn-danger"
              type="button"
              disabled={!canDelete || deleteMutation.isPending}
              onClick={() => {
                if (!canDelete) return;
                if (!window.confirm('Удалить товар? Это действие необратимо.')) return;
                deleteMutation.mutate();
              }}
              title={canDelete ? 'Удалить товар' : 'Удаление недоступно: есть операции'}
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить товар'}
            </button>
          </div>
        </form>
      </section>

      <div className="stack">
        <h3>Остатки и движения</h3>
        <section className="product-stats-strip">
          <div className="product-stats-item">
            <span className="product-stats-label">Текущий остаток</span>
            <span className="product-stats-value mono">{Number(extStats.product?.quantity ?? form.quantity ?? 0)}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Приходов (шт)</span>
            <span className="product-stats-value mono">{warehouse.receipts_qty || 0}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Отгрузок (шт)</span>
            <span className="product-stats-value mono">{warehouse.shipments_qty || 0}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Списаний (шт)</span>
            <span className="product-stats-value mono">{warehouse.writeoffs_qty || 0}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Корректировки</span>
            <span className="product-stats-value mono">{warehouse.corrections_qty || 0}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Инвент. разница</span>
            <span className="product-stats-value mono">{warehouse.inventory_diff_qty || 0}</span>
          </div>
        </section>

        <h3>Заказы Ozon</h3>
        <section className="product-stats-strip">
          <div className="product-stats-item">
            <span className="product-stats-label">Заказов</span>
            <span className="product-stats-value mono">{orders.postings || 0}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Строк</span>
            <span className="product-stats-value mono">{orders.lines || 0}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Заказано</span>
            <span className="product-stats-value mono">{orders.units_total || 0}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Передано</span>
            <span className="product-stats-value mono">{orders.units_transferred || 0}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Доставлено</span>
            <span className="product-stats-value mono">{orders.units_delivered || 0}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Отменено</span>
            <span className="product-stats-value mono">{orders.units_canceled || 0}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Выручка gross</span>
            <span className="product-stats-value mono">{Number(orders.revenue_gross || 0).toFixed(2)}</span>
          </div>
          <div className="product-stats-item">
            <span className="product-stats-label">Оплачено</span>
            <span className="product-stats-value mono">{Number(orders.revenue_paid || 0).toFixed(2)}</span>
          </div>
        </section>
      </div>

      <section className="card">
        <h3>Лента движений и заказов</h3>
        <div className="toolbar history-pager">
          <label className="history-pager-label">
            Показывать:
            <select
              className="input"
              value={timelineLimit}
              onChange={(event) => {
                setTimelineLimit(event.target.value);
                setTimelinePage(1);
              }}
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="all">Все</option>
            </select>
          </label>
          <span className="history-pager-range">
            {timelineRangeStart}-{timelineRangeEnd} из {timelineTotal}
          </span>
          {timelineLimit !== 'all' && (
            <>
              <button
                className="btn"
                type="button"
                disabled={timelinePage <= 1}
                onClick={() => setTimelinePage((prev) => Math.max(1, prev - 1))}
              >
                Назад
              </button>
              <span className="history-pager-range">Стр. {timelinePage} / {timelinePages}</span>
              <button
                className="btn"
                type="button"
                disabled={timelinePage >= timelinePages}
                onClick={() => setTimelinePage((prev) => Math.min(timelinePages, prev + 1))}
              >
                Вперед
              </button>
            </>
          )}
        </div>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Источник</th>
                <th>Документ</th>
                <th>Изменение</th>
                <th>Кол-во</th>
                <th>Статус</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {timelineItems.map((row, idx) => (
                <tr key={`${row.kind}-${row.operation_id || row.order_line_id || idx}`}>
                  <td>{String(row.event_time || '').slice(0, 19).replace('T', ' ') || '—'}</td>
                  <td>{row.kind === 'warehouse' ? row.event_type : 'ozon_order'}</td>
                  <td>{row.kind === 'warehouse' ? 'warehouse' : row.source}</td>
                  <td>{row.kind === 'warehouse' ? `#${row.operation_id}` : (row.posting_number || row.order_number || '—')}</td>
                  <td>
                    {row.kind === 'warehouse'
                      ? (Number(row.quantity_change || 0) > 0
                        ? `+${Number(row.quantity_change || 0)}`
                        : Number(row.quantity_change || 0))
                      : '—'}
                  </td>
                  <td>{row.kind === 'warehouse' ? row.quantity_abs : row.quantity}</td>
                  <td>{row.status || '—'}</td>
                  <td>
                    <span className="cell-ellipsis" title={row.note || row.details || ''}>
                      {row.note || row.details || '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {timelineItems.length === 0 && (
                <tr><td colSpan={8} className="empty-row">Нет данных по движениям</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
