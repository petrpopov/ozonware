import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';
import { useRouteRefetch } from '../hooks/useRouteRefetch.js';
import { useUiStore } from '../store/useUiStore.js';
import { TrashIcon } from '../components/Icons.jsx';

const defaultField = { name: '', type: 'text', required: false, showInTable: true, options: [] };

function normalizeField(field) {
  return {
    ...field,
    showInTable: field.showInTable ?? field.show_in_table ?? true,
    options: Array.isArray(field.options) ? field.options : []
  };
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const fieldsQuery = useQuery({ queryKey: ['product-fields'], queryFn: services.getProductFields });
  const googleQuery = useQuery({ queryKey: ['google-config'], queryFn: services.getGoogleConfig });
  const ozonQuery = useQuery({ queryKey: ['ozon-settings'], queryFn: services.getOzonSettings });

  useRouteRefetch(fieldsQuery.refetch);
  useRouteRefetch(googleQuery.refetch);
  useRouteRefetch(ozonQuery.refetch);

  const [fields, setFields] = useState([]);
  const [google, setGoogle] = useState({ spreadsheetId: '', sheetName: 'Лист1', skuColumn: 'A', quantityColumn: 'B', startRow: 2 });
  const [ozon, setOzon] = useState({ clientId: '', apiKey: '', syncStartDate: '' });
  const [ozonStats, setOzonStats] = useState([]);
  const ozonSyncDateRef = useRef(null);

  const toDateTimeLocalValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const normalized = raw.replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return raw.slice(0, 16);
    }

    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  useEffect(() => {
    if (fieldsQuery.data) {
      setFields(fieldsQuery.data.map(normalizeField));
    }
  }, [fieldsQuery.data]);

  useEffect(() => {
    if (googleQuery.data) setGoogle(googleQuery.data);
  }, [googleQuery.data]);

  useEffect(() => {
    if (ozonQuery.data) {
      setOzon({
        clientId: ozonQuery.data.clientId || '',
        apiKey: ozonQuery.data.apiKey || '',
        syncStartDate: toDateTimeLocalValue(ozonQuery.data.syncStartDate)
      });
    }
  }, [ozonQuery.data]);

  const saveFieldsMutation = useMutation({
    mutationFn: async () => {
      const existing = await services.getProductFields();
      for (const item of existing) {
        await services.deleteProductField(item.id);
      }
      for (let i = 0; i < fields.length; i += 1) {
        const field = fields[i];
        await services.createProductField({
          name: field.name,
          type: field.type,
          required: field.required,
          show_in_table: field.showInTable !== false,
          options: field.options || [],
          position: i
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-fields'] });
      pushToast('Поля сохранены', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const saveGoogleMutation = useMutation({
    mutationFn: () => services.saveGoogleConfig(google),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-config'] });
      pushToast('Google Sheets настройки сохранены', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const testGoogleMutation = useMutation({
    mutationFn: () => services.testGoogleConfig(google),
    onSuccess: (result) => pushToast(result.success ? 'Подключение к Google OK' : result.error || 'Ошибка', result.success ? 'success' : 'error'),
    onError: (error) => pushToast(error.message, 'error')
  });

  const syncGoogleMutation = useMutation({
    mutationFn: () => services.syncGoogle(google),
    onSuccess: (result) => pushToast(`Синхронизировано строк: ${result.updated || 0}`, 'success'),
    onError: (error) => pushToast(error.message, 'error')
  });

  const saveOzonMutation = useMutation({
    mutationFn: () => services.saveOzonSettings({
      ...ozon,
      syncStartDate: ozon.syncStartDate ? new Date(ozon.syncStartDate).toISOString() : ''
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ozon-settings'] });
      pushToast('Настройки OZON сохранены', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const loadOzonStatsMutation = useMutation({
    mutationFn: services.getOzonShipments,
    onSuccess: (data) => {
      setOzonStats(data || []);
      pushToast('Данные OZON загружены', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const resetStateMutation = useMutation({
    mutationFn: services.resetWarehouseState,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['writeoffs-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ozon-shipments'] });
      setConfirmResetOpen(false);
      pushToast(result.message || 'Состояние очищено', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  useEffect(() => {
    if (!confirmResetOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setConfirmResetOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmResetOpen]);

  if (fieldsQuery.isLoading || googleQuery.isLoading || ozonQuery.isLoading) return <p>Загрузка...</p>;

  return (
    <div className="stack">
      <section className="card">
        <h3>Поля товаров</h3>
        <div className="stack-sm">
          {fields.map((field, index) => (
            <div className="field-card" key={`${field.id || 'new'}-${index}`}>
              <div className="form-row">
                <input
                  className="input"
                  placeholder="Название"
                  value={field.name}
                  onChange={(e) =>
                    setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, name: e.target.value } : item)))
                  }
                />
                <select
                  className="input"
                  value={field.type}
                  onChange={(e) =>
                    setFields((prev) =>
                      prev.map((item, idx) => {
                        if (idx !== index) return item;
                        const nextType = e.target.value;
                        return {
                          ...item,
                          type: nextType,
                          options: nextType === 'select' ? (Array.isArray(item.options) ? item.options : []) : []
                        };
                      })
                    )
                  }
                >
                  <option value="barcode">barcode</option>
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="color">color</option>
                  <option value="image">image</option>
                  <option value="select">select</option>
                </select>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!field.required}
                    onChange={(e) =>
                      setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, required: e.target.checked } : item)))
                    }
                  />
                  Обязательное
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={field.showInTable !== false}
                    onChange={(e) =>
                      setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, showInTable: e.target.checked } : item)))
                    }
                  />
                  В таблице
                </label>
                <button
                  className="btn btn-danger btn-icon"
                  onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== index))}
                  type="button"
                  aria-label="Удалить поле"
                  title="Удалить поле"
                >
                  <TrashIcon />
                </button>
              </div>

              {field.type === 'select' && (
                <div className="select-options-editor">
                  <div className="select-options-title">Значения списка:</div>
                  <div className="select-options-list">
                    {(field.options || []).map((option, optionIndex) => (
                      <div className="select-option-row" key={`${field.name}-${optionIndex}`}>
                        <input
                          className="input"
                          placeholder="Значение"
                          value={option}
                          onChange={(e) =>
                            setFields((prev) =>
                              prev.map((item, idx) => {
                                if (idx !== index) return item;
                                const nextOptions = [...(item.options || [])];
                                nextOptions[optionIndex] = e.target.value;
                                return { ...item, options: nextOptions };
                              })
                            )
                          }
                        />
                        <button
                          className="btn btn-danger btn-icon"
                          onClick={() =>
                            setFields((prev) =>
                              prev.map((item, idx) => {
                                if (idx !== index) return item;
                                return {
                                  ...item,
                                  options: (item.options || []).filter((_, idx2) => idx2 !== optionIndex)
                                };
                              })
                            )
                          }
                          type="button"
                          aria-label="Удалить значение"
                          title="Удалить значение"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      setFields((prev) =>
                        prev.map((item, idx) => {
                          if (idx !== index) return item;
                          return { ...item, options: [...(item.options || []), ''] };
                        })
                      )
                    }
                  >
                    + Добавить значение
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setFields((prev) => [...prev, { ...defaultField }])}>+ Поле</button>
          <button className="btn btn-primary" onClick={() => saveFieldsMutation.mutate()} disabled={saveFieldsMutation.isPending}>Сохранить</button>
        </div>
      </section>

      <section className="card">
        <h3>Google Sheets</h3>
        <div className="form-row two-cols">
          <label>Spreadsheet ID<input className="input" value={google.spreadsheetId || ''} onChange={(e) => setGoogle((s) => ({ ...s, spreadsheetId: e.target.value }))} /></label>
          <label>Лист<input className="input" value={google.sheetName || ''} onChange={(e) => setGoogle((s) => ({ ...s, sheetName: e.target.value }))} /></label>
          <label>Колонка SKU<input className="input" value={google.skuColumn || ''} onChange={(e) => setGoogle((s) => ({ ...s, skuColumn: e.target.value }))} /></label>
          <label>Колонка Qty<input className="input" value={google.quantityColumn || ''} onChange={(e) => setGoogle((s) => ({ ...s, quantityColumn: e.target.value }))} /></label>
          <label>Start row<input className="input" type="number" value={google.startRow || 2} onChange={(e) => setGoogle((s) => ({ ...s, startRow: Number(e.target.value || 2) }))} /></label>
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={() => saveGoogleMutation.mutate()}>Сохранить</button>
          <button className="btn" onClick={() => testGoogleMutation.mutate()}>Проверить</button>
          <button className="btn" onClick={() => syncGoogleMutation.mutate()}>Синхронизировать</button>
        </div>
      </section>

      <section className="card">
        <h3>OZON</h3>
        <div className="form-row two-cols">
          <label>Client ID<input className="input" value={ozon.clientId} onChange={(e) => setOzon((s) => ({ ...s, clientId: e.target.value }))} /></label>
          <label>API Key<input className="input" value={ozon.apiKey} onChange={(e) => setOzon((s) => ({ ...s, apiKey: e.target.value }))} /></label>
          <label>
            Начало синхронизации
            <input
              ref={ozonSyncDateRef}
              className="input"
              type="datetime-local"
              value={ozon.syncStartDate}
              onClick={() => ozonSyncDateRef.current?.showPicker?.()}
              onChange={(e) => setOzon((s) => ({ ...s, syncStartDate: e.target.value }))}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={() => saveOzonMutation.mutate()}>Сохранить</button>
          <button className="btn" onClick={() => loadOzonStatsMutation.mutate()}>Загрузить статистику OZON</button>
        </div>

        {ozonStats.length > 0 && (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>День</th>
                  <th>Заказов</th>
                  <th>SKU</th>
                  <th>Штук</th>
                </tr>
              </thead>
              <tbody>
                {ozonStats.map((item, idx) => (
                  <tr key={`${item.day}-${idx}`}>
                    <td>{(item.day || '').slice(0, 10)}</td>
                    <td>{item.orderCount}</td>
                    <td>{item.skuCount}</td>
                    <td>{item.itemsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Технические операции</h3>
        <p className="import-subtitle">
          Очистка состояния удалит историю движений и данные синхронизации, но сохранит справочник товаров и настройки.
        </p>
        <div className="modal-actions">
          <button className="btn btn-danger" type="button" onClick={() => setConfirmResetOpen(true)}>
            Очистить состояние товаров
          </button>
        </div>
      </section>

      {confirmResetOpen && (
        <div className="modal-backdrop" onClick={() => setConfirmResetOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Подтверждение очистки</h3>
            <p className="danger-note">
              Действие удалит операции, списания и OZON-таблицы синхронизации, а остатки всех товаров будут сброшены в 0.
            </p>
            <p className="import-subtitle">
              Товары, кастомные поля и настройки API/Google/OZON останутся без изменений.
            </p>
            <div className="modal-actions">
              <button className="btn" type="button" onClick={() => setConfirmResetOpen(false)}>
                Отмена
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => resetStateMutation.mutate()}
                disabled={resetStateMutation.isPending}
              >
                {resetStateMutation.isPending ? 'Очистка...' : 'Да, очистить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
