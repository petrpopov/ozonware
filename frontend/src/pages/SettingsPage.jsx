import { useEffect, useRef, useState } from 'react';
import Modal from '../components/Modal.jsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';
import { useRouteRefetch } from '../hooks/useRouteRefetch.js';
import { useUiStore } from '../store/useUiStore.js';

const defaultField = { name: '', type: 'text', required: false, showInTable: true, options: [] };

const TABS = [
  { id: 'fields', label: 'Поля товаров' },
  { id: 'gsheets', label: 'Google Sheets' },
  { id: 'ozon', label: 'OZON' },
  { id: 'danger', label: 'Дополнительно' }
];

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
  const [activeTab, setActiveTab] = useState('fields');

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
          options: (field.options || []).filter((opt) => String(opt).trim() !== ''),
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


  const updateField = (index, patch) => {
    setFields((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const updateFieldOption = (fieldIndex, optionIndex, value) => {
    setFields((prev) =>
      prev.map((item, idx) => {
        if (idx !== fieldIndex) return item;
        const nextOptions = [...(item.options || [])];
        nextOptions[optionIndex] = value;
        return { ...item, options: nextOptions };
      })
    );
  };

  const removeFieldOption = (fieldIndex, optionIndex) => {
    setFields((prev) =>
      prev.map((item, idx) => {
        if (idx !== fieldIndex) return item;
        return { ...item, options: (item.options || []).filter((_, i) => i !== optionIndex) };
      })
    );
  };

  const addFieldOption = (fieldIndex) => {
    setFields((prev) =>
      prev.map((item, idx) => {
        if (idx !== fieldIndex) return item;
        return { ...item, options: [...(item.options || []), ''] };
      })
    );
  };

  if (fieldsQuery.isLoading || googleQuery.isLoading || ozonQuery.isLoading) return <p>Загрузка...</p>;

  return (
    <div className="settings-page">
      <div className="settings-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'settings-tab active' : 'settings-tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'fields' && (
        <div className="settings-section">
          <div className="settings-fields-head">
            <span>Название поля</span>
            <span>Тип</span>
            <span>Обязательное</span>
            <span>В таблице</span>
            <span aria-hidden="true" />
          </div>
          {fields.map((field, index) => (
            <div key={`${field.id || 'new'}-${index}`}>
              <div className="settings-fields-row">
                <input
                  className="input settings-field-name"
                  placeholder="Название"
                  value={field.name}
                  onChange={(e) => updateField(index, { name: e.target.value })}
                />
                <select
                  className="input settings-field-type"
                  value={field.type}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    updateField(index, {
                      type: nextType,
                      options: nextType === 'select' ? (field.options || []) : []
                    });
                  }}
                >
                  <option value="barcode">barcode</option>
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="color">color</option>
                  <option value="image">image</option>
                  <option value="select">select</option>
                </select>
                <label className="settings-row-check settings-field-req">
                  <input
                    type="checkbox"
                    checked={!!field.required}
                    onChange={(e) => updateField(index, { required: e.target.checked })}
                  />
                  Да
                </label>
                <label className="settings-row-check settings-field-show">
                  <input
                    type="checkbox"
                    checked={field.showInTable !== false}
                    onChange={(e) => updateField(index, { showInTable: e.target.checked })}
                  />
                  Да
                </label>
                <button
                  type="button"
                  className="settings-row-del settings-field-del"
                  aria-label="Удалить поле"
                  title="Удалить поле"
                  onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== index))}
                >
                  ×
                </button>
              </div>

              {field.type === 'select' && (
                <div className="settings-fields-subrow">
                  <span className="settings-subrow-label">Значения:</span>
                  {(field.options || []).map((option, optionIndex) => (
                    <span className="settings-chip" key={`opt-${index}-${optionIndex}`}>
                      <input
                        className="settings-chip-input"
                        value={option}
                        placeholder="значение"
                        style={{ width: `${Math.max(6, (option || '').length + 1)}ch` }}
                        onChange={(e) => updateFieldOption(index, optionIndex, e.target.value)}
                      />
                      <button
                        type="button"
                        className="settings-chip-x"
                        aria-label="Удалить значение"
                        onClick={() => removeFieldOption(index, optionIndex)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className="settings-chip-add"
                    onClick={() => addFieldOption(index)}
                  >
                    + добавить
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className="settings-fields-footer">
            <button
              type="button"
              className="btn"
              onClick={() => setFields((prev) => [...prev, { ...defaultField }])}
            >
              + Добавить поле
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => saveFieldsMutation.mutate()}
              disabled={saveFieldsMutation.isPending}
            >
              Сохранить
            </button>
          </div>
        </div>
      )}

      {activeTab === 'gsheets' && (
        <div className="settings-section settings-section-pad">
          <div className="settings-form-grid">
            <div className="settings-form-field settings-field-full">
              <span className="settings-form-label">Spreadsheet ID</span>
              <input
                className="input"
                value={google.spreadsheetId || ''}
                onChange={(e) => setGoogle((s) => ({ ...s, spreadsheetId: e.target.value }))}
              />
            </div>
            <div className="settings-form-field">
              <span className="settings-form-label">Лист</span>
              <input
                className="input"
                value={google.sheetName || ''}
                onChange={(e) => setGoogle((s) => ({ ...s, sheetName: e.target.value }))}
              />
            </div>
            <div className="settings-form-field">
              <span className="settings-form-label">Колонка SKU</span>
              <input
                className="input"
                value={google.skuColumn || ''}
                onChange={(e) => setGoogle((s) => ({ ...s, skuColumn: e.target.value }))}
              />
            </div>
            <div className="settings-form-field">
              <span className="settings-form-label">Колонка Qty</span>
              <input
                className="input"
                value={google.quantityColumn || ''}
                onChange={(e) => setGoogle((s) => ({ ...s, quantityColumn: e.target.value }))}
              />
            </div>
            <div className="settings-form-field">
              <span className="settings-form-label">Start row</span>
              <input
                className="input"
                type="number"
                value={google.startRow || 2}
                onChange={(e) => setGoogle((s) => ({ ...s, startRow: Number(e.target.value || 2) }))}
              />
            </div>
          </div>
          <div className="settings-form-actions">
            <button type="button" className="btn" onClick={() => testGoogleMutation.mutate()}>Проверить</button>
            <button type="button" className="btn" onClick={() => syncGoogleMutation.mutate()}>Синхронизировать</button>
            <button type="button" className="btn btn-primary" onClick={() => saveGoogleMutation.mutate()}>Сохранить</button>
          </div>
        </div>
      )}

      {activeTab === 'ozon' && (
        <div className="settings-section settings-section-pad">
          <div className="settings-form-grid">
            <div className="settings-form-field">
              <span className="settings-form-label">Client ID</span>
              <input
                className="input"
                value={ozon.clientId}
                onChange={(e) => setOzon((s) => ({ ...s, clientId: e.target.value }))}
              />
            </div>
            <div className="settings-form-field">
              <span className="settings-form-label">API Key</span>
              <input
                className="input"
                type="password"
                value={ozon.apiKey}
                onChange={(e) => setOzon((s) => ({ ...s, apiKey: e.target.value }))}
              />
            </div>
            <div className="settings-form-field">
              <span className="settings-form-label">Начало синхронизации</span>
              <input
                ref={ozonSyncDateRef}
                className="input"
                type="datetime-local"
                value={ozon.syncStartDate}
                onClick={() => ozonSyncDateRef.current?.showPicker?.()}
                onChange={(e) => setOzon((s) => ({ ...s, syncStartDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="settings-form-actions">
            <button type="button" className="btn" onClick={() => loadOzonStatsMutation.mutate()}>
              Загрузить статистику OZON
            </button>
            <button type="button" className="btn btn-primary" onClick={() => saveOzonMutation.mutate()}>
              Сохранить
            </button>
          </div>

          {ozonStats.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
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
        </div>
      )}

      {activeTab === 'danger' && (
        <div className="settings-danger-zone">
          <h4 className="settings-danger-title">Опасная зона</h4>
          <p className="settings-danger-desc">
            Очистка состояния удалит историю движений и данные синхронизации, но сохранит справочник товаров и настройки. Это действие необратимо.
          </p>
          <button
            type="button"
            className="btn-danger-ghost"
            onClick={() => setConfirmResetOpen(true)}
          >
            Очистить состояние товаров
          </button>
        </div>
      )}

      <Modal
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Подтверждение очистки"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-cancel" onClick={() => setConfirmResetOpen(false)}>
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
          </>
        }
      >
        <p className="danger-note">
          Действие удалит операции, списания и OZON-таблицы синхронизации, а остатки всех товаров будут сброшены в 0.
        </p>
        <p className="import-subtitle">
          Товары, кастомные поля и настройки API/Google/OZON останутся без изменений.
        </p>
      </Modal>
    </div>
  );
}
