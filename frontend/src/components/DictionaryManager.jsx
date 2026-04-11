import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';

/**
 * DictionaryManager — универсальный CRUD-компонент для справочников.
 *
 * Props:
 *   name        – ключ справочника (e.g. "writeoff_reasons")
 *   columns     – [{key, label, type?}]  (type: 'boolean' для чекбоксов)
 *   editableFields – [{key, label, type?}]  поля формы добавления/редактирования
 *   title       – заголовок секции
 *   readOnly    – не показывать кнопки add/edit/delete
 */
export default function DictionaryManager({ name, columns = [], editableFields = [], title, readOnly = false }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(null); // null | {mode: 'add'|'edit', data: {}}
  const [errors, setErrors] = useState({});

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['dictionary', name],
    queryFn: () => services.getDictionary(name),
  });

  const createMutation = useMutation({
    mutationFn: (body) => services.createDictionaryItem(name, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dictionary', name] }); setForm(null); },
    onError: (e) => setErrors({ _global: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => services.updateDictionaryItem(name, id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dictionary', name] }); setForm(null); },
    onError: (e) => setErrors({ _global: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => services.deleteDictionaryItem(name, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dictionary', name] }),
  });

  const openAdd = () => {
    const empty = Object.fromEntries(editableFields.map((f) => [f.key, f.type === 'boolean' ? true : '']));
    setForm({ mode: 'add', data: empty });
    setErrors({});
  };

  const openEdit = (item) => {
    const data = Object.fromEntries(editableFields.map((f) => [f.key, item[f.key] ?? (f.type === 'boolean' ? true : '')]));
    setForm({ mode: 'edit', data: { ...data, id: item.id } });
    setErrors({});
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(editableFields.map((f) => [f.key, form.data[f.key]]));
    if (form.mode === 'add') {
      createMutation.mutate(body);
    } else {
      updateMutation.mutate({ id: form.data.id, body });
    }
  };

  const canEdit = (item) => !readOnly && !item.is_system;

  if (isLoading) return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Загрузка...</div>;

  return (
    <div>
      {title && <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--bg-hover)' }}>
            {columns.map((col) => (
              <th key={col.key} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px' }}>
                {col.label}
              </th>
            ))}
            {!readOnly && <th style={{ width: '80px' }} />}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id ?? item.code} style={{ borderBottom: '1px solid var(--bg-hover)' }}>
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '7px 8px', color: col.muted ? 'var(--text-muted)' : 'var(--text)' }}>
                  {col.type === 'boolean'
                    ? (item[col.key] ? '✓' : '—')
                    : col.type === 'array'
                    ? (Array.isArray(item[col.key]) ? item[col.key].join(', ') : item[col.key])
                    : String(item[col.key] ?? '—')}
                </td>
              ))}
              {!readOnly && (
                <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                  {canEdit(item) && (
                    <>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '12px', padding: '2px 8px', marginRight: '4px' }} onClick={() => openEdit(item)}>
                        Изм.
                      </button>
                      <button type="button" className="btn btn-danger-ghost" style={{ fontSize: '12px', padding: '2px 8px' }} onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending}>
                        ✕
                      </button>
                    </>
                  )}
                  {item.is_system && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>системное</span>
                  )}
                </td>
              )}
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Список пуст
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {!readOnly && editableFields.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          {form === null ? (
            <button type="button" className="btn btn-ghost" style={{ fontSize: '13px' }} onClick={openAdd}>
              + Добавить
            </button>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end', marginTop: '8px' }}>
              {editableFields.map((f) => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{f.label}</label>
                  {f.type === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={!!form.data[f.key]}
                      onChange={(e) => setForm((prev) => ({ ...prev, data: { ...prev.data, [f.key]: e.target.checked } }))}
                    />
                  ) : (
                    <input
                      className="input"
                      style={{ width: f.wide ? '200px' : '140px' }}
                      value={form.data[f.key] ?? ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, data: { ...prev.data, [f.key]: e.target.value } }))}
                    />
                  )}
                </div>
              ))}
              {errors._global && (
                <div style={{ color: 'var(--danger)', fontSize: '12px', width: '100%' }}>{errors._global}</div>
              )}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }} disabled={createMutation.isPending || updateMutation.isPending}>
                  {form.mode === 'add' ? 'Добавить' : 'Сохранить'}
                </button>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '13px' }} onClick={() => setForm(null)}>
                  Отмена
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
