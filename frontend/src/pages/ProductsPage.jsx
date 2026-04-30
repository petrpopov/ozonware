import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { services } from '../api/services.js';
import { useRouteRefetch } from '../hooks/useRouteRefetch.js';
import { useUiStore } from '../store/useUiStore.js';
import { EditIcon, TrashIcon } from '../components/Icons.jsx';
import Modal from '../components/Modal.jsx';
import Dropdown from '../components/Dropdown.jsx';
import { FIELD_KIND_OZON_SKU, FIELD_NAME_OZON_PHOTO } from '../constants/fieldKinds.js';
import HexColorInput from '../components/HexColorInput.jsx';

const emptyForm = {
  id: null,
  name: '',
  sku: '',
  quantity: 0,
  description: '',
  custom_fields: [],
  is_active: true
};

function normalizeCustomFields(product, fields) {
  const map = new Map((product.custom_fields || []).map((f) => [f.name, f]));
  return fields.map((field) => {
    const existing = map.get(field.name);
    let value = existing?.value ?? '';
    if (!value && field.type === 'select' && field.required && field.options?.length) {
      value = field.options[0];
    }

    return {
      name: field.name,
      value,
      type: field.type,
      required: !!field.required
    };
  });
}

function isHexColor(value) {
  if (typeof value !== 'string') return false;
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(value.trim());
}

function categoryClass(value) {
  const v = String(value || '').toLowerCase();
  if (v.includes('petg')) return 'cat petg';
  if (v.includes('basic')) return 'cat basic';
  if (v.includes('matte')) return 'cat matte';
  if (v.includes('lite')) return 'cat lite';
  return 'cat';
}

function getNowStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function downloadTextFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(';') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function normalizeSheetRows(rawRows) {
  const rows = (rawRows || []).map((row) => (Array.isArray(row) ? row : []));
  if (!rows.length) {
    return { headers: [], rows: [] };
  }

  // Find the right-most non-empty cell across all rows to avoid huge trailing empty columns.
  let maxColIndex = -1;
  rows.forEach((row) => {
    row.forEach((cell, index) => {
      if (String(cell ?? '').trim() !== '' && index > maxColIndex) {
        maxColIndex = index;
      }
    });
  });

  if (maxColIndex < 0) {
    return { headers: [], rows: [] };
  }

  const clipped = rows.map((row) => row.slice(0, maxColIndex + 1));
  const headerRow = clipped[0] || [];
  const headers = headerRow.map((item, idx) => String(item || `Колонка ${idx + 1}`).trim());
  const dataRows = clipped
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

  return { headers, rows: dataRows };
}

let xlsxModulePromise = null;
async function loadXlsx() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx');
  }
  return xlsxModulePromise;
}

export default function ProductsPage({ catalogMode = false }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [pageLimit, setPageLimit] = useState('20');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [showZeroStock, setShowZeroStock] = useState(
    () => localStorage.getItem('products:showZeroStock') === 'true'
  );
  const [sort, setSort] = useState({ key: 'id', dir: 'desc' });
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [importFileName, setImportFileName] = useState('');
  const [importSheets, setImportSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [importHeaders, setImportHeaders] = useState([]);
  const [importRows, setImportRows] = useState([]);
  const [importMapping, setImportMapping] = useState({});
  const [importStats, setImportStats] = useState(null);
  const [importError, setImportError] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const sortKeyMap = { id: 'id', name: 'name', sku: 'sku', quantity: 'quantity' };
  const serverSort = sort.key in sortKeyMap ? `${sortKeyMap[sort.key]},${sort.dir}` : 'id,desc';

  const productsQuery = useQuery({
    queryKey: ['products', catalogMode ? 'catalog' : 'page', search, page, pageLimit, serverSort, showZeroStock],
    queryFn: () => services.getProductsPage({
      search,
      page: page - 1,
      size: pageLimit === 'all' ? 9999 : Number(pageLimit),
      sort: serverSort,
      hideZeroStock: !catalogMode && !showZeroStock,
      includeInactive: catalogMode
    }),
    placeholderData: (previousData) => previousData
  });

  const fieldsQuery = useQuery({
    queryKey: ['product-fields'],
    queryFn: services.getProductFields
  });

  useRouteRefetch(productsQuery.refetch);
  useRouteRefetch(fieldsQuery.refetch);

  const fields = useMemo(
    () =>
      (fieldsQuery.data || [])
        .filter((f) => f.kind !== FIELD_KIND_OZON_SKU)
        .map((field) => ({
          ...field,
          required: !!field.required,
          options: Array.isArray(field.options) ? field.options : [],
          showInTable: field.showInTable ?? field.show_in_table ?? true
        })),
    [fieldsQuery.data]
  );

  const fieldNames = useMemo(
    () => fields.filter((f) => f.showInTable !== false).map((f) => f.name),
    [fields]
  );

  const importTargets = useMemo(() => {
    const base = [
      { key: '', label: '-- Не импортировать --' },
      { key: 'name', label: 'Название товара' },
      { key: 'sku', label: 'SKU' },
      { key: 'description', label: 'Описание' }
    ];
    const custom = fields.map((field) => ({
      key: `custom:${field.name}`,
      label: `${field.name} (доп. поле)`
    }));
    return [...base, ...custom];
  }, [fields]);

  const rawItems = productsQuery.data?.items || [];
  const pagedProducts = useMemo(() => {
    if (!sort.key.startsWith('custom:')) return rawItems;
    const cfName = sort.key.slice('custom:'.length);
    return [...rawItems].sort((a, b) => {
      const av = (a.custom_fields || []).find((f) => f.name === cfName)?.value ?? '';
      const bv = (b.custom_fields || []).find((f) => f.name === cfName)?.value ?? '';
      const result = String(av).localeCompare(String(bv), 'ru', { numeric: true, sensitivity: 'base' });
      return sort.dir === 'asc' ? result : -result;
    });
  }, [rawItems, sort]);

  const totalProducts = Number(productsQuery.data?.total || 0);
  const totalPages = pageLimit === 'all' ? 1 : Math.max(1, Math.ceil(totalProducts / Math.max(1, Number(pageLimit))));
  const pageOffset = (page - 1) * (pageLimit === 'all' ? 0 : Number(pageLimit));
  const rangeStart = totalProducts === 0 ? 0 : pageOffset + 1;
  const rangeEnd = totalProducts === 0 ? 0 : Math.min(pageOffset + pagedProducts.length, totalProducts);

  const productsStats = {
    totalSkus: Number(productsQuery.data?.totalAll ?? productsQuery.data?.total ?? 0),
    inStockSkus: Number(productsQuery.data?.inStockSkus || 0),
    inStockUnits: Number(productsQuery.data?.totalUnits || 0),
    lowStock: Number(productsQuery.data?.lowStockSkus || 0),
    zeroStock: Number(productsQuery.data?.zeroStockSkus
      ?? ((productsQuery.data?.totalAll ?? productsQuery.data?.total ?? 0) - Number(productsQuery.data?.inStockSkus || 0))),
  };

  const categoryCounts = useMemo(() => {
    const result = {};
    const list = productsQuery.data?.items || [];
    for (const it of list) {
      const cf = (it.custom_fields || []).find((f) => String(f.name).toLowerCase().includes('категор') || String(f.name).toLowerCase() === 'category');
      if (!cf?.value) continue;
      result[cf.value] = (result[cf.value] || 0) + 1;
    }
    return result;
  }, [productsQuery.data]);

  const toggleSort = (key) => {
    setPage(1);
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  };

  const renderSortMark = (key) => {
    if (sort.key !== key) return '↕';
    return sort.dir === 'asc' ? '▲' : '▼';
  };
  const sortThClass = (key) => 'sortable' + (sort.key === key ? ' sorted' : '');

  const buildExportData = async () => {
    const allProducts = await services.getProducts(search);
    const filtered = showZeroStock ? allProducts : allProducts.filter((p) => Number(p.quantity || 0) > 0);
    const columns = ['ID', 'Название', 'SKU', ...fieldNames, 'Остаток'];
    const rows = filtered.map((product) => {
      const fieldMap = new Map((product.custom_fields || []).map((f) => [f.name, f.value]));
      return [product.id, product.name, product.sku, ...fieldNames.map((n) => fieldMap.get(n) || ''), product.quantity];
    });
    return { columns, rows };
  };

  const exportCsv = () => {
    buildExportData().then(({ columns, rows }) => {
      const csv = [columns, ...rows].map((row) => row.map(escapeCsvCell).join(';')).join('\n');
      downloadTextFile(`\uFEFF${csv}`, `products_${getNowStamp()}.csv`, 'text/csv;charset=utf-8;');
    }).catch((error) => pushToast(`Ошибка экспорта CSV: ${error.message}`, 'error'));
  };

  const exportExcel = () => {
    (async () => {
      const [XLSX, { columns, rows }] = await Promise.all([loadXlsx(), buildExportData()]);
      const worksheet = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
      XLSX.writeFileXLSX(workbook, `products_${getNowStamp()}.xlsx`);
    })().catch((error) => {
      pushToast(`Ошибка экспорта Excel: ${error.message}`, 'error');
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const { id, ...body } = payload;
      if (id) {
        return services.updateProduct(id, body);
      }
      return services.createProduct(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setOpen(false);
      setForm(emptyForm);
      pushToast('Товар сохранен', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => services.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast('Товар удален', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const syncOzonProductsMutation = useMutation({
    mutationFn: services.syncOzonProducts,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-fields'] });
      const summary = result?.summary || {};
      pushToast(
        `OZON: обновлено фото ${summary.updated || 0} (найдено: ${summary.matched || 0}, не найдено: ${summary.notFound || 0})`,
        'success'
      );
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const openCreate = () => {
    setForm({
      ...emptyForm,
      is_active: !catalogMode,
      custom_fields: fields.map((field) => ({
        name: field.name,
        value: field.type === 'select' && field.required && field.options?.length ? field.options[0] : '',
        type: field.type,
        required: !!field.required
      }))
    });
    setErrors({});
    setOpen(true);
  };

  const closeImportModal = () => {
    setImportOpen(false);
    setImportStep(1);
    setImportFileName('');
    setImportSheets([]);
    setSelectedSheet('');
    setImportHeaders([]);
    setImportRows([]);
    setImportMapping({});
    setImportStats(null);
    setImportError('');
  };

  const normalizeText = (value) => String(value ?? '').trim().toLowerCase();

  const autoBuildMapping = (headers) => {
    const next = {};
    headers.forEach((header, index) => {
      const normalized = normalizeText(header);
      const target = importTargets.find((item) => {
        if (!item.key) return false;
        if (normalizeText(item.label) === normalized) return true;
        if (normalizeText(item.key) === normalized) return true;
        if (item.key.startsWith('custom:')) {
          const fieldName = item.key.slice('custom:'.length);
          return normalizeText(fieldName) === normalized;
        }
        return false;
      });
      next[index] = target?.key || '';
    });
    setImportMapping(next);
  };

  const applySelectedSheet = (sheetName) => {
    const sheet = importSheets.find((item) => item.name === sheetName);
    if (!sheet) {
      setImportError('Выбранный лист не найден');
      return false;
    }
    if (!sheet.headers.length) {
      setImportError('На выбранном листе нет заголовков');
      return false;
    }

    setImportError('');
    setSelectedSheet(sheet.name);
    setImportHeaders(sheet.headers);
    setImportRows(sheet.rows);
    autoBuildMapping(sheet.headers);
    return true;
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    if (!/\.xlsx?$/.test(file.name.toLowerCase())) {
      setImportError('Поддерживаются только .xlsx и .xls файлы');
      return;
    }

    try {
      setImportError('');
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheets = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        const normalized = normalizeSheetRows(rows);
        return { name: sheetName, headers: normalized.headers, rows: normalized.rows };
      });

      if (!sheets.length) {
        setImportError('В файле нет листов для импорта');
        return;
      }

      const firstNonEmpty = sheets.find((sheet) => sheet.headers.length > 0) || sheets[0];
      setImportFileName(file.name);
      setImportSheets(sheets);
      setSelectedSheet(firstNonEmpty.name);
      setImportHeaders([]);
      setImportRows([]);
      setImportMapping({});
      setImportStats(null);
      setImportStep(1);
    } catch (error) {
      setImportError(`Ошибка чтения файла: ${error.message}`);
    }
  };

  const continueToMapping = () => {
    if (!selectedSheet) {
      setImportError('Выберите лист для импорта');
      return;
    }
    if (!applySelectedSheet(selectedSheet)) {
      return;
    }
    setImportStep(2);
  };

  const setMappingValue = (columnIndex, targetKey) => {
    setImportMapping((prev) => {
      const next = { ...prev };
      if (targetKey) {
        Object.keys(next).forEach((key) => {
          if (Number(key) !== columnIndex && next[key] === targetKey) {
            next[key] = '';
          }
        });
      }
      next[columnIndex] = targetKey;
      return next;
    });
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const mappedSku = Object.values(importMapping).includes('sku');
      const mappedName = Object.values(importMapping).includes('name');

      if (!mappedSku || !mappedName) {
        throw new Error('Необходимо сопоставить колонки SKU и Название товара');
      }

      const allProducts = await services.getProducts('');
      const existingSku = new Set(allProducts.map((item) => normalizeText(item.sku)));
      const fieldByName = new Map(fields.map((field) => [field.name, field]));

      let created = 0;
      let skippedDuplicate = 0;
      let skippedInvalid = 0;

      for (const row of importRows) {
        let sku = '';
        let name = '';
        let description = '';
        const customMap = new Map();

        importHeaders.forEach((_, colIdx) => {
          const target = importMapping[colIdx];
          if (!target) return;

          const raw = row[colIdx];
          const value = String(raw ?? '').trim();

          if (target === 'sku') sku = value;
          else if (target === 'name') name = value;
          else if (target === 'description') description = value;
          else if (target.startsWith('custom:')) {
            const fieldName = target.slice('custom:'.length);
            if (!value) return;
            const field = fieldByName.get(fieldName);
            customMap.set(fieldName, {
              name: fieldName,
              type: field?.type || 'text',
              value,
              required: !!field?.required
            });
          }
        });

        const normalizedSku = normalizeText(sku);
        if (!normalizedSku || !name.trim()) {
          skippedInvalid += 1;
          continue;
        }

        if (existingSku.has(normalizedSku)) {
          skippedDuplicate += 1;
          continue;
        }

        try {
          await services.createProduct({
            name: name.trim(),
            sku: sku.trim(),
            quantity: 0,
            description: description.trim(),
            custom_fields: Array.from(customMap.values()),
            is_active: !catalogMode
          });
          existingSku.add(normalizedSku);
          created += 1;
        } catch (error) {
          if (error.message.includes('SKU already exists')) {
            skippedDuplicate += 1;
          } else {
            throw error;
          }
        }
      }

      return { created, skippedDuplicate, skippedInvalid };
    },
    onSuccess: (result) => {
      setImportStats(result);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast(`Импорт завершен: добавлено ${result.created}`, 'success');
    },
    onError: (error) => {
      setImportError(error.message);
      pushToast(error.message, 'error');
    }
  });

  const openEdit = (product) => {
    setForm({
      ...product,
      is_active: !!product.is_active,
      custom_fields: normalizeCustomFields(product, fields)
    });
    setErrors({});
    setOpen(true);
  };


  useEffect(() => {
    setPage(1);
  }, [search, showZeroStock, pageLimit]);

  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const validateForm = () => {
    const nextErrors = {};

    if (!form.name?.trim()) {
      nextErrors.name = 'Введите название товара';
    }

    if (!form.sku?.trim()) {
      nextErrors.sku = 'Введите SKU';
    }

    fields.forEach((field, idx) => {
      if (!field.required) return;
      const value = form.custom_fields?.[idx]?.value;
      if (String(value ?? '').trim() === '') {
        nextErrors[`custom_${idx}`] = `Поле "${field.name}" обязательно`;
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = (event) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }

    const payload = {
      id: form.id,
      name: form.name.trim(),
      sku: form.sku.trim(),
      quantity: Number(form.quantity || 0),
      description: form.description || '',
      custom_fields: (form.custom_fields || [])
        .filter((field) => {
          if (typeof field.value === 'number') return true;
          return String(field.value || '').trim() !== '';
        })
        .map((field) => ({
          name: field.name,
          value: field.value,
          type: field.type,
          required: field.required
        }))
    };
    if (!form.id || catalogMode) {
      payload.is_active = !!form.is_active;
    }
    saveMutation.mutate(payload);
  };

  if (fieldsQuery.isLoading || (productsQuery.isLoading && !productsQuery.data)) {
    return <p>Загрузка...</p>;
  }

  const modalPhoto = String(
    (form.custom_fields || []).find((f) => String(f.name || '').trim() === FIELD_NAME_OZON_PHOTO)?.value || ''
  ).trim();

  return (
    <section>
      <div className="page-head">
        <div className="page-title-cluster">
          <h1 className="page-title">{catalogMode ? 'Справочник' : 'Товары'}</h1>
          <div className="page-subtitle">
            {catalogMode ? 'Все SKU поставщика, включая неактивные' : 'Управление каталогом и остатками'}
          </div>
        </div>
        {!catalogMode && (
          <div className="kpi-strip">
            <div className="kpi"><div className="kpi-label">Артикулов</div><div className="kpi-value">{productsStats.totalSkus}</div></div>
            <div className="kpi"><div className="kpi-label">В наличии</div><div className="kpi-value">{productsStats.inStockSkus}</div></div>
            <div className="kpi"><div className="kpi-label">Ед. на складе</div><div className="kpi-value">{productsStats.inStockUnits}</div></div>
            <div className={'kpi' + (productsStats.lowStock > 0 ? ' warn' : '')}><div className="kpi-label">Low stock</div><div className="kpi-value">{productsStats.lowStock}</div></div>
            <div className={'kpi' + (productsStats.zeroStock > 0 ? ' crit' : '')}><div className="kpi-label">Закончились</div><div className="kpi-value">{productsStats.zeroStock}</div></div>
          </div>
        )}
      </div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={openCreate}>+ Добавить</button>
        <div className="toolbar__sep" />
        {catalogMode ? (
          <button className="btn" type="button" onClick={() => setImportOpen(true)}>Импорт</button>
        ) : (
          <Dropdown
            label="Импорт"
            items={[
              { label: 'Из Excel', onClick: () => setImportOpen(true) },
              {
                label: syncOzonProductsMutation.isPending ? 'Синхр...' : 'Синхр. OZON',
                onClick: () => syncOzonProductsMutation.mutate(),
                disabled: syncOzonProductsMutation.isPending
              }
            ]}
          />
        )}
        <Dropdown
          label="Экспорт"
          items={[
            { label: 'Excel', onClick: exportExcel },
            { label: 'CSV', onClick: exportCsv }
          ]}
        />
        <div className="toolbar__spacer" />
        <input
          className="input"
          placeholder="Поиск по названию / SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!catalogMode && (
      <div className="chipbar">
        <span className="chipbar-label">Категория</span>
        {Object.keys(categoryCounts).length === 0 && (
          <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>—</span>
        )}
        {Object.entries(categoryCounts).map(([name, count]) => (
          <div key={name} className={'chip ' + categoryClass(name)} style={{ cursor: 'default' }}>
            <span>{name}</span>
            <span className="chip-count">{count}</span>
          </div>
        ))}
        <div className="chip-sep" />
        <span className="chipbar-label">Пресеты</span>
        <div className="chip preset-chip" title="Пресет (скоро)">
          <span>Низкий остаток</span>
        </div>
        <div className="chip preset-chip" title="Пресет (скоро)">
          <span>Нет в наличии</span>
        </div>
        <div className="chip preset-chip" title="Пресет (скоро)">
          <span>+ Сохранить вид</span>
        </div>
        <div style={{ flex: 1 }} />
        <label
          className="cb-label"
          onClick={() => {
            const next = !showZeroStock;
            localStorage.setItem('products:showZeroStock', String(next));
            setShowZeroStock(next);
          }}
        >
          <span className={'cb' + (showZeroStock ? ' checked' : '')} />
          Показывать товары с нулевым остатком
        </label>
      </div>
      )}

      <div className="table-wrap">
        <table className="table table-compact">
          <thead>
            <tr>
              <th className={sortThClass('id')} onClick={() => toggleSort('id')}>ID <span>{renderSortMark('id')}</span></th>
              <th>Фото</th>
              <th className={sortThClass('name')} onClick={() => toggleSort('name')}>Название <span>{renderSortMark('name')}</span></th>
              <th className={sortThClass('sku')} onClick={() => toggleSort('sku')}>SKU <span>{renderSortMark('sku')}</span></th>
              {fieldNames.map((name) => (
                <th
                  key={name}
                  className={sortThClass(`custom:${name}`)}
                  onClick={() => toggleSort(`custom:${name}`)}
                >
                  {name} <span>{renderSortMark(`custom:${name}`)}</span>
                </th>
              ))}
              {!catalogMode && (
                <th className={sortThClass('quantity')} onClick={() => toggleSort('quantity')}>Остаток <span>{renderSortMark('quantity')}</span></th>
              )}
              {catalogMode && <th>Статус</th>}
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {pagedProducts.map((product) => {
              const fieldMap = new Map((product.custom_fields || []).map((f) => [f.name, f.value]));
              const ozonPhoto = String(fieldMap.get(FIELD_NAME_OZON_PHOTO) || '');
              return (
                <tr key={product.id} className={catalogMode && !product.is_active ? 'match-catalog' : ''}>
                  <td>
                    <button
                      type="button"
                      className="id-link-btn"
                      onClick={() => navigate(`/products/${product.id}`)}
                      aria-label={`Открыть карточку товара #${product.id}`}
                    >
                      {product.id}
                    </button>
                  </td>
                  <td>
                    {ozonPhoto ? (
                      <img className="product-mini-image" src={ozonPhoto} alt={product.name} loading="lazy" />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className="cell-ellipsis cell-name" title={product.name}>{product.name}</span>
                  </td>
                  <td>
                    <span className="cell-ellipsis" title={product.sku}>{product.sku}</span>
                  </td>
                  {fieldNames.map((name) => {
                    const value = fieldMap.get(name) || '—';
                    const lower = name.toLowerCase();
                    const isHexColumn = lower === 'hex' || lower.includes('hex');
                    const isCategoryColumn = lower.includes('категор') || lower === 'category';
                    const showSwatch = isHexColumn && isHexColor(value);
                    const catClass = isCategoryColumn ? categoryClass(value) : '';

                    return (
                      <td key={name}>
                        {isCategoryColumn && value !== '—' ? (
                          <span className={catClass}>{value}</span>
                        ) : (
                          <span className="cell-ellipsis hex-cell" title={value}>
                            {showSwatch && <span className="hex-swatch" style={{ backgroundColor: value }} />}
                            {value}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {!catalogMode && (
                    <td>
                      <div className="stock-cell">
                        <span className={'stock-dot ' + (product.quantity === 0 ? 'crit' : 'ok')} />
                        <span className={'stock-num' + (product.quantity === 0 ? ' crit' : '')}>
                          {product.quantity}
                        </span>
                      </div>
                    </td>
                  )}
                  {catalogMode && (
                    <td>
                      {product.is_active
                        ? <span className="match-pill match-pill-found">Активный</span>
                        : <span className="match-pill match-pill-catalog">В справочнике</span>
                      }
                    </td>
                  )}
                  <td className="row-actions">
                    <button
                      className="icon-btn"
                      onClick={() => openEdit(product)}
                      aria-label="Изменить"
                      title="Изменить"
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() => setDeleteCandidate(product)}
                      aria-label="Удалить"
                      title="Удалить"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
            {pagedProducts.length === 0 && (
              <tr>
                <td colSpan={fieldNames.length + 6} style={{ padding: 0, border: 'none' }}>
                  <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 6px', fontWeight: 500, color: 'var(--text)' }}>Товары не найдены</p>
                    <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                      Попробуйте изменить фильтр или добавьте новый товар
                    </p>
                    <button className="btn" type="button" onClick={openCreate}>
                      Добавить товар
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="toolbar history-pager">
        <label className="history-pager-label">
          Показывать:
          <select
            className="input"
            value={pageLimit}
            onChange={(e) => {
              setPageLimit(e.target.value);
              setPage(1);
            }}
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="200">200</option>
            <option value="all">Все</option>
          </select>
        </label>
        <span className="history-pager-range">
          {rangeStart}-{rangeEnd} из {totalProducts}
        </span>
        {pageLimit !== 'all' && (
          <>
            <button
              className="btn"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Назад
            </button>
            <span className="history-pager-range">
              Стр. {page} / {totalPages}
            </span>
            <button
              className="btn"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Вперед
            </button>
          </>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => { setOpen(false); setErrors({}); }}
        title={form.id ? 'Редактировать товар' : 'Новый товар'}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn-cancel"
              onClick={() => { setOpen(false); setErrors({}); }}
            >
              Отмена
            </button>
            <button
              type="submit"
              form="product-form"
              className="btn btn-primary"
              disabled={saveMutation.isPending}
            >
              Сохранить
            </button>
          </>
        }
      >
        <form id="product-form" onSubmit={submit} className="form-grid form-grid--2col" noValidate>
          {form.id && modalPhoto && (
            <div className="form-grid-item--full modal-photo-preview">
              <img src={modalPhoto} alt={form.name || 'product'} className="modal-photo-thumb" loading="lazy" />
            </div>
          )}
          <label>
            Название*
            <input
              className={`input ${errors.name ? 'input-error' : ''}`}
              value={form.name}
              onChange={(e) => {
                const value = e.target.value;
                setForm((s) => ({ ...s, name: value }));
                if (errors.name && value.trim()) {
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
            />
            <span className={`field-error ${errors.name ? '' : 'field-error-placeholder'}`}>
              {errors.name || ' '}
            </span>
          </label>
          <label>
            SKU*
            <input
              className={`input ${errors.sku ? 'input-error' : ''}`}
              value={form.sku}
              onChange={(e) => {
                const value = e.target.value;
                setForm((s) => ({ ...s, sku: value }));
                if (errors.sku && value.trim()) {
                  setErrors((prev) => ({ ...prev, sku: undefined }));
                }
              }}
            />
            <span className={`field-error ${errors.sku ? '' : 'field-error-placeholder'}`}>
              {errors.sku || ' '}
            </span>
          </label>
          <label>
            Количество
            <input
              className="input"
              type="number"
              value={form.quantity}
              onChange={(e) => setForm((s) => ({ ...s, quantity: e.target.value }))}
            />
            <span className="field-error field-error-placeholder">&nbsp;</span>
          </label>

          {catalogMode && (
            <label
              className="cb-label"
              onClick={() => setForm((s) => ({ ...s, is_active: !s.is_active }))}
            >
              <span className={'cb' + (form.is_active ? ' checked' : '')} />
              Активный (виден в разделе «Товары»)
            </label>
          )}

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
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setForm((s) => ({
                        ...s,
                        custom_fields: (s.custom_fields || []).map((item, itemIdx) =>
                          itemIdx === idx ? { ...item, value: nextValue } : item
                        )
                      }));
                      if (errors[errorKey] && String(nextValue).trim()) {
                        setErrors((prev) => ({ ...prev, [errorKey]: undefined }));
                      }
                    }}
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
                    onChange={(nextValue) => {
                      setForm((s) => ({
                        ...s,
                        custom_fields: (s.custom_fields || []).map((item, itemIdx) =>
                          itemIdx === idx ? { ...item, value: nextValue } : item
                        )
                      }));
                      if (errors[errorKey] && String(nextValue).trim()) {
                        setErrors((prev) => ({ ...prev, [errorKey]: undefined }));
                      }
                    }}
                  />
                ) : (
                  <input
                    className={`input ${errors[errorKey] ? 'input-error' : ''}`}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={value}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setForm((s) => ({
                        ...s,
                        custom_fields: (s.custom_fields || []).map((item, itemIdx) =>
                          itemIdx === idx ? { ...item, value: nextValue } : item
                        )
                      }));
                      if (errors[errorKey] && String(nextValue).trim()) {
                        setErrors((prev) => ({ ...prev, [errorKey]: undefined }));
                      }
                    }}
                  />
                )}
                <span className={`field-error ${errors[errorKey] ? '' : 'field-error-placeholder'}`}>
                  {errors[errorKey] || ' '}
                </span>
              </label>
            );
          })}

          <label className="form-grid-item--full">
            Описание
            <textarea
              className="input"
              value={form.description || ''}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            />
          </label>
        </form>
      </Modal>

      <Modal
        open={importOpen}
        onClose={closeImportModal}
        title="Импорт товаров из Excel"
        size="lg"
        footer={
          <>
            {importStep === 2 && (
              <button className="btn-cancel" type="button" onClick={() => setImportStep(1)}>
                Назад
              </button>
            )}
            <button className="btn-cancel" type="button" onClick={closeImportModal}>
              Закрыть
            </button>
            {importStep === 2 && (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending || importRows.length === 0}
              >
                {importMutation.isPending ? 'Импорт...' : 'Импортировать'}
              </button>
            )}
          </>
        }
      >
        <p className="import-subtitle">
          Шаг {importStep} из 2. Импортируются только новые SKU (с учетом trim), остаток для новых товаров = 0.
        </p>

            {importStep === 1 && (
              <div className="import-step">
                <label className="btn btn-primary import-file-btn">
                  Выбрать файл Excel
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden-input"
                    onChange={(e) => handleImportFile(e.target.files?.[0])}
                  />
                </label>
                {importFileName && <div className="import-file-name">Файл: {importFileName}</div>}
                {importSheets.length > 0 && (
                  <div className="import-sheet-picker">
                    <label>
                      Лист файла
                      <select
                        className="input"
                        value={selectedSheet}
                        onChange={(e) => setSelectedSheet(e.target.value)}
                      >
                        {importSheets.map((sheet) => (
                          <option key={sheet.name} value={sheet.name}>
                            {sheet.name} ({sheet.rows.length} строк)
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="btn btn-primary" type="button" onClick={continueToMapping}>
                      Продолжить
                    </button>
                  </div>
                )}
                {importError && <div className="import-error">{importError}</div>}
              </div>
            )}

            {importStep === 2 && (
              <div className="import-step">
                <div className="import-mapping-head">
                  <div>Файл: <strong>{importFileName}</strong></div>
                  <div>Строк данных: <strong>{importRows.length}</strong></div>
                </div>
                {importSheets.length > 0 && (
                  <div className="import-sheet-picker import-sheet-picker-inline">
                    <label>
                      Лист файла
                      <select
                        className="input"
                        value={selectedSheet}
                        onChange={(e) => {
                          const nextSheet = e.target.value;
                          applySelectedSheet(nextSheet);
                        }}
                      >
                        {importSheets.map((sheet) => (
                          <option key={sheet.name} value={sheet.name}>
                            {sheet.name} ({sheet.rows.length} строк)
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                <div className="mapping-grid">
                  <div className="mapping-grid-head">
                    <span>Колонка Excel</span>
                    <span>Пример значения</span>
                    <span>Сопоставление</span>
                  </div>
                  {importHeaders.map((header, index) => (
                    <div className="mapping-row" key={`${header}-${index}`}>
                      <div className="mapping-col-name">{header || `Колонка ${index + 1}`}</div>
                      <div className="mapping-col-sample" title={String(importRows[0]?.[index] ?? '')}>
                        {String(importRows[0]?.[index] ?? '—')}
                      </div>
                      <div>
                        <select
                          className="input mapping-select"
                          value={importMapping[index] || ''}
                          onChange={(e) => setMappingValue(index, e.target.value)}
                        >
                          {importTargets.map((target) => (
                            <option key={`${index}-${target.key || 'none'}`} value={target.key}>
                              {target.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="import-preview">
                  <h4>Предпросмотр (все строки)</h4>
                  <div className="table-wrap import-preview-table">
                    <table className="table compact">
                      <thead>
                        <tr>
                          {importHeaders.map((header, index) => (
                            <th key={`preview-head-${index}`}>{header || `Колонка ${index + 1}`}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row, rowIdx) => (
                          <tr key={`preview-row-${rowIdx}`}>
                            {importHeaders.map((_, colIdx) => (
                              <td key={`preview-cell-${rowIdx}-${colIdx}`}>
                                <span className="cell-ellipsis" title={String(row[colIdx] ?? '')}>
                                  {String(row[colIdx] ?? '') || '—'}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {importError && <div className="import-error">{importError}</div>}
                {importStats && (
                  <div className="import-result">
                    Добавлено: <strong>{importStats.created}</strong> ·
                    Дубликатов: <strong>{importStats.skippedDuplicate}</strong> ·
                    Пропущено (пустые name/sku): <strong>{importStats.skippedInvalid}</strong>
                  </div>
                )}
              </div>
            )}

      </Modal>

      <Modal
        open={!!deleteCandidate}
        onClose={() => setDeleteCandidate(null)}
        title="Удалить товар?"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-cancel" onClick={() => setDeleteCandidate(null)}>
              Отмена
            </button>
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => {
                deleteMutation.mutate(deleteCandidate.id);
                setDeleteCandidate(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Удалить
            </button>
          </>
        }
      >
        <p>
          Вы уверены, что хотите удалить товар
          {' '}
          <strong>{deleteCandidate?.name}</strong>
          {' '}
          (
          <strong>{deleteCandidate?.sku}</strong>
          )?
        </p>
      </Modal>
    </section>
  );
}
