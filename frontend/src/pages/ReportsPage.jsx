import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';
import { useRouteRefetch } from '../hooks/useRouteRefetch.js';
import { useUiStore } from '../store/useUiStore.js';

function parseSemicolonCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ';' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(value);
      value = '';
      if (row.length > 1 || (row[0] || '').trim()) rows.push(row);
      row = [];
      continue;
    }
    value += ch;
  }
  if (value.length || row.length) {
    row.push(value);
    if (row.length > 1 || (row[0] || '').trim()) rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || '').replace(/^\uFEFF/, '').trim());
  return rows.slice(1).map((cells) => {
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = String(cells[idx] ?? '').trim();
    });
    return row;
  });
}

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [importSource, setImportSource] = useState('fbs_csv');
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState('');
  const [importPreview, setImportPreview] = useState([]);

  const statsQuery = useQuery({ queryKey: ['stats'], queryFn: services.getStats });
  const operationsQuery = useQuery({ queryKey: ['operations', 'recent'], queryFn: () => services.getOperations({ limit: 20 }) });
  const importsQuery = useQuery({ queryKey: ['ozon-order-imports'], queryFn: () => services.getOzonOrderImports(30) });

  const importMutation = useMutation({
    mutationFn: (payload) => services.importOzonOrdersCsvRows(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ozon-order-imports'] });
      setImportRows([]);
      setImportPreview([]);
      setImportFileName('');
      setImportError('');
      const summary = result?.summary || {};
      pushToast(
        `Импорт завершен: добавлено ${summary.saved || 0}, обновлено ${summary.updated || 0}, пропущено ${summary.skipped || 0}, не сопоставлено ${summary.unmatched || 0}`,
        'success'
      );
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  useRouteRefetch(statsQuery.refetch);
  useRouteRefetch(operationsQuery.refetch);
  useRouteRefetch(importsQuery.refetch);

  const totals = useMemo(
    () =>
      (importsQuery.data || []).reduce(
        (acc, row) => {
          acc.total += Number(row.rows_total || 0);
          acc.saved += Number(row.rows_saved || 0);
          acc.updated += Number(row.rows_updated || 0);
          acc.unmatched += Number(row.rows_unmatched || 0);
          return acc;
        },
        { total: 0, saved: 0, updated: 0, unmatched: 0 }
      ),
    [importsQuery.data]
  );

  const onFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setImportError('Поддерживается только CSV');
      return;
    }
    try {
      const text = await file.text();
      const rows = rowsToObjects(parseSemicolonCsv(text));
      setImportFileName(file.name);
      setImportRows(rows);
      setImportPreview(rows.slice(0, 8));
      setImportError('');
    } catch (error) {
      setImportError(error.message || 'Ошибка чтения CSV');
      setImportRows([]);
      setImportPreview([]);
    }
  };

  if (statsQuery.isLoading || operationsQuery.isLoading || importsQuery.isLoading) return <p>Загрузка...</p>;

  const stats = statsQuery.data || {};

  return (
    <div className="stack">
      <section className="card">
        <h3>Импорт заказов Ozon (CSV)</h3>
        <div className="form-row two-cols">
          <label>
            Тип файла
            <select className="input" value={importSource} onChange={(e) => setImportSource(e.target.value)}>
              <option value="fbs_csv">FBS (postings.csv)</option>
              <option value="fbo_csv">FBO (orders.csv)</option>
            </select>
          </label>
          <div className="stack-sm">
            <span>CSV файл</span>
            <label className="btn import-file-btn">
              Загрузить CSV
              <input className="hidden-input" type="file" accept=".csv,text/csv" onChange={onFileChange} />
            </label>
          </div>
        </div>
        {importFileName && <div className="import-file-name">Файл: {importFileName}</div>}
        {importError && <div className="import-error">{importError}</div>}
        {importRows.length > 0 && (
          <div className="stack-sm">
            <div className="import-result">
              Строк в файле: <strong>{importRows.length}</strong> · Превью: <strong>{importPreview.length}</strong>
            </div>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Номер отправления</th>
                    <th>Принят в обработку</th>
                    <th>Статус</th>
                    <th>SKU</th>
                    <th>Артикул</th>
                    <th>Количество</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((row, idx) => (
                    <tr key={`preview-${idx}`}>
                      <td>{row['Номер отправления'] || '—'}</td>
                      <td>{row['Принят в обработку'] || '—'}</td>
                      <td>{row['Статус'] || '—'}</td>
                      <td>{row['SKU'] || '—'}</td>
                      <td>{row['Артикул'] || '—'}</td>
                      <td>{row['Количество'] || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => importMutation.mutate({ source: importSource, file_name: importFileName, rows: importRows })}
            disabled={importMutation.isPending || importRows.length === 0}
          >
            {importMutation.isPending ? 'Импорт...' : 'Импортировать'}
          </button>
        </div>
      </section>

      <section className="stats-grid">
        <div className="stat-card"><h4>Товаров</h4><p>{stats.totalProducts || 0}</p></div>
        <div className="stat-card"><h4>Единиц</h4><p>{stats.totalQuantity || 0}</p></div>
        <div className="stat-card"><h4>Приходов</h4><p>{stats.totalReceipts || 0}</p></div>
        <div className="stat-card"><h4>Отгрузок</h4><p>{stats.totalShipments || 0}</p></div>
      </section>

      <section className="card">
        <h3>История импортов Ozon CSV</h3>
        <div className="import-result">
          Строк: <strong>{totals.total}</strong> · Добавлено: <strong>{totals.saved}</strong> · Обновлено:{' '}
          <strong>{totals.updated}</strong> · Не сопоставлено: <strong>{totals.unmatched}</strong>
        </div>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>ID</th>
                <th>Дата</th>
                <th>Источник</th>
                <th>Файл</th>
                <th>Строк</th>
                <th>Добавлено</th>
                <th>Обновлено</th>
                <th>Пропущено</th>
                <th>Не сопоставлено</th>
              </tr>
            </thead>
            <tbody>
              {(importsQuery.data || []).map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{String(row.imported_at || '').slice(0, 19).replace('T', ' ')}</td>
                  <td>{row.source}</td>
                  <td><span className="cell-ellipsis" title={row.file_name || '—'}>{row.file_name || '—'}</span></td>
                  <td>{row.rows_total || 0}</td>
                  <td>{row.rows_saved || 0}</td>
                  <td>{row.rows_updated || 0}</td>
                  <td>{row.rows_skipped || 0}</td>
                  <td>{row.rows_unmatched || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>Последние операции</h3>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>ID</th>
                <th>Тип</th>
                <th>Дата</th>
                <th>Количество</th>
                <th>Примечание</th>
              </tr>
            </thead>
            <tbody>
              {(operationsQuery.data || []).map((op) => (
                <tr key={op.id}>
                  <td>{op.id}</td>
                  <td>{op.type}</td>
                  <td>{(op.operation_date || op.created_at || '').slice(0, 10)}</td>
                  <td>{op.total_quantity || 0}</td>
                  <td>{op.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
