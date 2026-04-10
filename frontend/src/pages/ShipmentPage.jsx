import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '../api/services.js';
import { useRouteRefetch } from '../hooks/useRouteRefetch.js';
import { useUiStore } from '../store/useUiStore.js';
import OperationBuilder from '../components/OperationBuilder.jsx';
import OperationsHistory from '../components/OperationsHistory.jsx';
import Modal from '../components/Modal.jsx';
import ShipmentEditModal from '../components/ShipmentEditModal.jsx';

function parseCsvDateToDay(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dmy = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return raw.slice(0, 10).replace(/\./g, '-');
}

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
      if (row.length > 1 || (row[0] ?? '').trim()) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    value += ch;
  }

  if (value.length || row.length) {
    row.push(value);
    if (row.length > 1 || (row[0] ?? '').trim()) {
      rows.push(row);
    }
  }

  return rows;
}

function cleanCsvHeader(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
}

export default function ShipmentPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [historyLimit, setHistoryLimit] = useState('20');
  const [historyPage, setHistoryPage] = useState(1);
  const [shipmentFilter, setShipmentFilter] = useState('all');
  const [historySort, setHistorySort] = useState({ key: 'id', dir: 'desc' });
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [shipmentSyncOpen, setShipmentSyncOpen] = useState(false);
  const [shipmentSyncTab, setShipmentSyncTab] = useState('fbs');
  const [fbsSyncRunning, setFbsSyncRunning] = useState(false);
  const [fbsSyncMessages, setFbsSyncMessages] = useState([]);
  const [fbsSyncError, setFbsSyncError] = useState('');
  const [fbsSyncCompleted, setFbsSyncCompleted] = useState(false);
  const [fbsStatsDays, setFbsStatsDays] = useState([]);
  const [fbsCsvFileName, setFbsCsvFileName] = useState('');
  const [fbsCsvError, setFbsCsvError] = useState('');
  const [fbsCsvDays, setFbsCsvDays] = useState([]);
  const [fbsCsvAnalysis, setFbsCsvAnalysis] = useState(null);
  const [fbsCsvAnalyzeLoading, setFbsCsvAnalyzeLoading] = useState(false);
  const [fbsCsvApplyReport, setFbsCsvApplyReport] = useState(null);
  const [expandedFbsDay, setExpandedFbsDay] = useState('');
  const [fboSyncRunning, setFboSyncRunning] = useState(false);
  const [fboSyncMessages, setFboSyncMessages] = useState([]);
  const [fboSyncError, setFboSyncError] = useState('');
  const [fboSyncCompleted, setFboSyncCompleted] = useState(false);
  const [fboStatsDays, setFboStatsDays] = useState([]);
  const [expandedFboDay, setExpandedFboDay] = useState('');
  const fbsSourceRef = useRef(null);
  const fboSourceRef = useRef(null);

  const productsQuery = useQuery({ queryKey: ['products', 'shipment'], queryFn: () => services.getProducts('') });
  const operationsOffset = historyLimit === 'all' ? 0 : (historyPage - 1) * Number(historyLimit);
  const operationsQuery = useQuery({
    queryKey: ['operations', 'shipment', historyLimit, operationsOffset, shipmentFilter],
    queryFn: () =>
      services.getOperations({
        type: 'shipment',
        limit: historyLimit,
        offset: operationsOffset,
        includeTotal: true,
        shipmentKind: shipmentFilter
      })
  });

  useRouteRefetch(productsQuery.refetch);
  useRouteRefetch(operationsQuery.refetch);

  const operationsData = operationsQuery.data?.items || [];
  const operationsTotal = Number(operationsQuery.data?.total || 0);
  const effectiveLimit = historyLimit === 'all' ? operationsTotal || operationsData.length : Number(historyLimit);
  const totalPages =
    historyLimit === 'all' ? 1 : Math.max(1, Math.ceil(operationsTotal / Math.max(1, effectiveLimit)));
  const rangeStart = operationsTotal === 0 ? 0 : operationsOffset + 1;
  const rangeEnd = operationsTotal === 0 ? 0 : Math.min(operationsOffset + operationsData.length, operationsTotal);

  const resolveShipmentKind = (operation) => {
    const note = String(operation?.note || '');
    if (note.startsWith('OZON FBS')) return 'fbs';
    if (note.startsWith('OZON FBO')) return 'fbo';
    return 'manual';
  };

  const resolveShipmentKindLabel = (operation) => {
    const kind = resolveShipmentKind(operation);
    if (kind === 'fbs') return 'FBS';
    if (kind === 'fbo') return 'FBO';
    return 'Ручная';
  };

  const sortedOperations = useMemo(() => {
    const getValue = (op, key) => {
      if (key === 'id') return Number(op.id || 0);
      if (key === 'date') return String(op.operation_date || '');
      if (key === 'opType') return resolveShipmentKindLabel(op);
      if (key === 'items') return Number(op.items?.length || 0);
      if (key === 'total') return Number(op.total_quantity || 0);
      if (key === 'note') return String(op.note || '');
      return '';
    };

    return [...operationsData].sort((a, b) => {
      const left = getValue(a, historySort.key);
      const right = getValue(b, historySort.key);
      const leftNum = Number(left);
      const rightNum = Number(right);
      const bothNum = Number.isFinite(leftNum) && Number.isFinite(rightNum) && left !== '' && right !== '';
      const compare = bothNum
        ? leftNum - rightNum
        : String(left).localeCompare(String(right), 'ru', { numeric: true, sensitivity: 'base' });
      return historySort.dir === 'asc' ? compare : -compare;
    });
  }, [operationsData, historySort]);

  const toggleSort = (key) => {
    setHistorySort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const createMutation = useMutation({
    mutationFn: services.createOperation,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'shipment'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'correction'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (result?.correction_operation_id) {
        pushToast(`Отгрузка проведена + корректировка #${result.correction_operation_id}`, 'success');
      } else {
        pushToast('Отгрузка проведена', 'success');
      }
      setAddOpen(false);
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => services.updateOperation(id, payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'shipment'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'correction'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (result?.correction_operation_id) {
        pushToast(`Отгрузка обновлена + корректировка #${result.correction_operation_id}`, 'success');
      } else {
        pushToast('Отгрузка обновлена', 'success');
      }
      setEditOpen(false);
      setEditForm(null);
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const deleteMutation = useMutation({
    mutationFn: services.deleteOperation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'shipment'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast('Операция удалена', 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => services.bulkDeleteOperations(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'shipment'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      pushToast(`Удалено операций: ${result?.deleted || 0}`, 'success');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const applyFbsMutation = useMutation({
    mutationFn: (days) => services.processOzonFbsShipments({ days }),
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'shipment'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      await loadFbsStats();
      const summary = result?.summary || {};
      pushToast(
        `FBS применено: ${summary.success || 0}, ошибок: ${summary.errors || 0}`,
        summary.errors ? 'error' : 'success'
      );
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const applyFbsCsvMutation = useMutation({
    mutationFn: (days) => services.processOzonFbsShipmentsFromCsv({ days }),
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'shipment'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      const summary = result?.summary || {};
      setFbsCsvApplyReport(result || null);
      pushToast(
        `FBS CSV проведено: ${summary.success || 0}, ошибок: ${summary.errors || 0}`,
        summary.errors ? 'error' : 'success'
      );
    },
    onError: (error) => {
      setFbsCsvApplyReport(null);
      pushToast(error.message, 'error');
    }
  });

  const applyFboMutation = useMutation({
    mutationFn: (days) => services.processOzonFboShipments({ days }),
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['operations', 'shipment'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      await loadFboStats();
      const summary = result?.summary || {};
      pushToast(
        `FBO применено: ${summary.success || 0}, ошибок: ${summary.errors || 0}, уже обработано: ${summary.alreadyProcessed || 0}`,
        summary.errors ? 'error' : 'success'
      );
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const cancelFboSyncMutation = useMutation({
    mutationFn: services.cancelOzonFboSync,
    onSuccess: () => {
      setFboSyncCompleted(false);
      setFboSyncRunning(false);
      if (fboSourceRef.current) {
        fboSourceRef.current.close();
        fboSourceRef.current = null;
      }
      pushFboMessage('FBO синхронизация отменена');
      pushToast('FBO синхронизация остановлена', 'info');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const cancelFbsSyncMutation = useMutation({
    mutationFn: services.cancelOzonFbsSync,
    onSuccess: () => {
      setFbsSyncCompleted(false);
      setFbsSyncRunning(false);
      if (fbsSourceRef.current) {
        fbsSourceRef.current.close();
        fbsSourceRef.current = null;
      }
      pushFbsMessage('FBS синхронизация отменена');
      pushToast('FBS синхронизация остановлена', 'info');
    },
    onError: (error) => pushToast(error.message, 'error')
  });

  const submit = (payload) => {
    createMutation.mutate(payload);
  };

  const openEditModal = async (operation) => {
    if (resolveShipmentKind(operation) !== 'manual') {
      return;
    }
    setEditLoading(true);
    try {
      const fullOperation = await services.getOperationById(operation.id);
      const products = productsQuery.data || [];
      const items = Array.isArray(fullOperation?.items)
        ? fullOperation.items.map((item) => {
            const requestQty = Number(item?.quantity || 0);
            const appliedQty = Number(item?.appliedQuantity);
            const hasAppliedQty = Number.isFinite(appliedQty);
            const hasShortage = hasAppliedQty && appliedQty < requestQty;
            const product = products.find((p) => p.id === Number(item?.productId));
            return {
              productId: Number(item?.productId),
              productName: item?.productName || product?.name || '',
              productSKU: item?.productSKU || product?.sku || '',
              quantity: requestQty > 0 ? requestQty : 1,
              reason: String(item?.reason || 'defect'),
              note: String(item?.note || ''),
              actualRemaining: Number(product?.quantity ?? 0),
              correctionReason: hasShortage ? 'Корректировка при редактировании отгрузки' : ''
            };
          })
        : [];

      setEditForm({
        id: Number(fullOperation.id),
        date: String(fullOperation.operation_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        note: String(fullOperation.note || ''),
        items
      });
      setEditOpen(true);
    } catch (error) {
      pushToast(error.message || 'Не удалось загрузить операцию для редактирования', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  const submitEdit = (payload) => {
    if (!editForm?.id) return;
    updateMutation.mutate({
      id: editForm.id,
      payload: {
        operation_date: payload.operation_date,
        note: payload.note || '',
        items: payload.items || [],
        total_quantity: payload.total_quantity || 0,
        allow_shortage: Boolean(payload.allow_shortage),
        shortage_adjustments: Array.isArray(payload.shortage_adjustments) ? payload.shortage_adjustments : []
      }
    });
  };

  const sortedFbsDays = useMemo(
    () => [...fbsStatsDays].sort((a, b) => String(b.day || '').localeCompare(String(a.day || ''))),
    [fbsStatsDays]
  );

  const fbsSummary = useMemo(
    () =>
      sortedFbsDays.reduce(
        (acc, day) => {
          acc.orders += Number(day.orderCount || 0);
          acc.items += Number(day.itemsCount || 0);
          return acc;
        },
        { orders: 0, items: 0 }
      ),
    [sortedFbsDays]
  );

  const sortedFboDays = useMemo(
    () => [...fboStatsDays].sort((a, b) => String(b.day || '').localeCompare(String(a.day || ''))),
    [fboStatsDays]
  );

  const fboSummary = useMemo(
    () =>
      sortedFboDays.reduce(
        (acc, day) => {
          acc.supplies += Number(day.supplyCount || 0);
          acc.items += Number(day.itemsCount || 0);
          return acc;
        },
        { supplies: 0, items: 0 }
      ),
    [sortedFboDays]
  );

  const resetFbsSyncModalState = () => {
    setFbsSyncMessages([]);
    setFbsSyncError('');
    setFbsSyncCompleted(false);
    setFbsStatsDays([]);
    setFbsCsvFileName('');
    setFbsCsvError('');
    setFbsCsvDays([]);
    setFbsCsvAnalysis(null);
    setFbsCsvAnalyzeLoading(false);
    setFbsCsvApplyReport(null);
    setExpandedFbsDay('');
  };

  const resetFboSyncModalState = () => {
    setFboSyncMessages([]);
    setFboSyncError('');
    setFboSyncCompleted(false);
    setFboStatsDays([]);
    setExpandedFboDay('');
  };

  const openFbsSyncModal = () => {
    resetFbsSyncModalState();
    setShipmentSyncTab('fbs');
    setShipmentSyncOpen(true);
  };

  const openFboSyncModal = () => {
    resetFboSyncModalState();
    setShipmentSyncTab('fbo');
    setShipmentSyncOpen(true);
  };

  const closeShipmentSyncModal = () => {
    if (fbsSourceRef.current) {
      fbsSourceRef.current.close();
      fbsSourceRef.current = null;
    }
    if (fboSourceRef.current) {
      fboSourceRef.current.close();
      fboSourceRef.current = null;
    }
    setFbsSyncRunning(false);
    setFboSyncRunning(false);
    setShipmentSyncOpen(false);
  };

  const loadFbsStats = async () => {
    const data = await services.getOzonShipments();
    setFbsStatsDays(Array.isArray(data) ? data : []);
  };

  const loadFboStats = async () => {
    const data = await services.getOzonFboSupplies();
    setFboStatsDays(Array.isArray(data) ? data : []);
  };

  const pushFbsMessage = (message) => {
    if (!message) return;
    setFbsSyncMessages((prev) => [...prev.slice(-8), message]);
  };

  const pushFboMessage = (message) => {
    if (!message) return;
    setFboSyncMessages((prev) => [...prev.slice(-8), message]);
  };

  const parseFbsCsv = async (file) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setFbsCsvError('Поддерживается только CSV файл выгрузки Ozon');
      return;
    }

    try {
      const text = await file.text();
      const lines = parseSemicolonCsv(text);
      if (!lines.length) {
        setFbsCsvError('Файл пустой');
        return;
      }

      const headers = lines[0].map(cleanCsvHeader);
      const rows = lines.slice(1).map((cells) => {
        const row = {};
        headers.forEach((header, idx) => {
          row[header] = String(cells[idx] ?? '').trim();
        });
        return row;
      });

      const grouped = new Map();

      rows.forEach((row) => {
        const status = String(row['Статус'] || '').trim().toLowerCase();
        const factTransfer = String(row['Фактическая дата передачи в доставку'] || '').trim();
        if ((status === 'отменён' || status === 'отменен') && !factTransfer) {
          return;
        }

        const sku = String(row['SKU'] || '').trim();
        const offerId = String(row['Артикул'] || '').trim();
        const name = String(row['Название товара'] || '').trim();
        const postingNumber = String(row['Номер отправления'] || '').trim();
        const qtyRaw = String(row['Количество'] || '').trim();
        const quantity = Number(qtyRaw.replace(/\s/g, '').replace(',', '.'));
        const orderAcceptedAt = String(row['Принят в обработку'] || '').trim();
        const day = parseCsvDateToDay(orderAcceptedAt || row['Дата отгрузки']);

        if (!day || !sku || !Number.isFinite(quantity) || quantity <= 0) {
          return;
        }

        if (!grouped.has(day)) {
          grouped.set(day, {
            day,
            orderNumbers: new Set(),
            itemsMap: new Map()
          });
        }

        const dayGroup = grouped.get(day);
        if (postingNumber) {
          dayGroup.orderNumbers.add(postingNumber);
        }
        const key = `${sku}|${offerId}`;
        if (!dayGroup.itemsMap.has(key)) {
          dayGroup.itemsMap.set(key, {
            sku,
            offer_id: offerId,
            name,
            quantity: 0
          });
        }
        dayGroup.itemsMap.get(key).quantity += quantity;
      });

      const preparedDays = Array.from(grouped.values())
        .map((group) => {
          const items = Array.from(group.itemsMap.values()).sort((a, b) =>
            String(a.sku).localeCompare(String(b.sku), 'ru', { numeric: true, sensitivity: 'base' })
          );
          const itemsCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
          return {
            day: group.day,
            orderCount: group.orderNumbers.size,
            skuCount: items.length,
            itemsCount,
            items
          };
        })
        .sort((a, b) => String(b.day).localeCompare(String(a.day)));

      setFbsCsvFileName(file.name);
      setFbsCsvError('');
      setFbsCsvDays(preparedDays);
      setFbsCsvApplyReport(null);
      setExpandedFbsDay(preparedDays[0]?.day || '');
      setFbsCsvAnalysis(null);

      if (preparedDays.length > 0) {
        setFbsCsvAnalyzeLoading(true);
        try {
          const analysis = await services.analyzeOzonFbsCsv({ days: preparedDays });
          setFbsCsvAnalysis(analysis || null);
        } catch (error) {
          setFbsCsvAnalysis(null);
          setFbsCsvError(error.message || 'Не удалось выполнить анализ CSV');
        } finally {
          setFbsCsvAnalyzeLoading(false);
        }
      }
    } catch (error) {
      setFbsCsvError(error.message || 'Ошибка чтения CSV');
      setFbsCsvDays([]);
      setFbsCsvAnalysis(null);
      setFbsCsvApplyReport(null);
    }
  };

  const fbsCsvAnalysisByDay = useMemo(() => {
    const map = new Map();
    const details = Array.isArray(fbsCsvAnalysis?.details) ? fbsCsvAnalysis.details : [];
    details.forEach((row) => map.set(String(row.day || ''), row));
    return map;
  }, [fbsCsvAnalysis]);

  const startFbsSync = () => {
    if (fbsSyncRunning) return;

    setFbsSyncError('');
    setFbsSyncCompleted(false);
    setFbsSyncMessages([]);
    setFbsStatsDays([]);
    setExpandedFbsDay('');
    setFbsSyncRunning(true);

    const source = new EventSource(`${import.meta.env.VITE_API_BASE || '/api'}/ozon/sync`);
    fbsSourceRef.current = source;

    source.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        pushFbsMessage(payload.message || payload.status);

        if (payload.status === 'error') {
          setFbsSyncError(payload.message || 'Ошибка синхронизации FBS');
          setFbsSyncCompleted(false);
          source.close();
          fbsSourceRef.current = null;
          setFbsSyncRunning(false);
          return;
        }

        if (payload.status === 'canceled') {
          setFbsSyncCompleted(false);
          source.close();
          fbsSourceRef.current = null;
          setFbsSyncRunning(false);
          pushFbsMessage(payload.message || 'FBS синхронизация отменена');
          return;
        }

        if (payload.status === 'complete' && payload.result) {
          source.close();
          fbsSourceRef.current = null;
          setFbsSyncRunning(false);
          setFbsSyncCompleted(true);
          await loadFbsStats();
          pushToast('Синхронизация FBS завершена', 'success');
        }
      } catch (error) {
        setFbsSyncError(error.message || 'Ошибка обработки прогресса синхронизации');
        setFbsSyncCompleted(false);
        source.close();
        fbsSourceRef.current = null;
        setFbsSyncRunning(false);
      }
    };

    source.onerror = () => {
      if (fbsSourceRef.current) {
        fbsSourceRef.current.close();
        fbsSourceRef.current = null;
      }
      setFbsSyncRunning(false);
      setFbsSyncCompleted(false);
    };
  };

  const startFboSync = () => {
    if (fboSyncRunning) return;

    setFboSyncError('');
    setFboSyncCompleted(false);
    setFboSyncMessages([]);
    setFboStatsDays([]);
    setExpandedFboDay('');
    setFboSyncRunning(true);

    const source = new EventSource(`${import.meta.env.VITE_API_BASE || '/api'}/ozon/fbo/sync`);
    fboSourceRef.current = source;

    source.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        pushFboMessage(payload.message || payload.status);

        if (payload.status === 'error') {
          setFboSyncError(payload.message || 'Ошибка синхронизации FBO');
          setFboSyncCompleted(false);
          source.close();
          fboSourceRef.current = null;
          setFboSyncRunning(false);
          return;
        }

        if (payload.status === 'canceled') {
          setFboSyncCompleted(false);
          source.close();
          fboSourceRef.current = null;
          setFboSyncRunning(false);
          pushFboMessage(payload.message || 'FBO синхронизация отменена');
          return;
        }

        if (payload.status === 'complete' && payload.result) {
          source.close();
          fboSourceRef.current = null;
          setFboSyncRunning(false);
          setFboSyncCompleted(true);
          await loadFboStats();
          pushToast('Синхронизация FBO завершена', 'success');
        }
      } catch (error) {
        setFboSyncError(error.message || 'Ошибка обработки прогресса синхронизации');
        setFboSyncCompleted(false);
        source.close();
        fboSourceRef.current = null;
        setFboSyncRunning(false);
      }
    };

    source.onerror = () => {
      if (fboSourceRef.current) {
        fboSourceRef.current.close();
        fboSourceRef.current = null;
      }
      setFboSyncRunning(false);
      setFboSyncCompleted(false);
    };
  };


  useEffect(() => () => {
    if (fbsSourceRef.current) {
      fbsSourceRef.current.close();
      fbsSourceRef.current = null;
    }
    if (fboSourceRef.current) {
      fboSourceRef.current.close();
      fboSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    setHistoryPage(1);
  }, [shipmentFilter]);

  if (productsQuery.isLoading || operationsQuery.isLoading) return <p>Загрузка...</p>;

  return (
    <div className="stack">
      <div className="toolbar operation-actions">
        <button className="btn operation-action-btn" type="button" onClick={() => setAddOpen(true)}>
          Добавить
        </button>
        <button className="btn btn-primary operation-action-btn" type="button" onClick={openFbsSyncModal}>
          Синхронизация FBS
        </button>
        <button className="btn btn-primary operation-action-btn" type="button" onClick={openFboSyncModal}>
          Синхронизация FBO
        </button>
      </div>
      <div className="toolbar history-pager">
        <label className="history-pager-label">
          Тип:
          <select
            className="input"
            value={shipmentFilter}
            onChange={(event) => {
              setShipmentFilter(event.target.value);
              setHistoryPage(1);
            }}
          >
            <option value="all">Все</option>
            <option value="fbs">FBS</option>
            <option value="fbo">FBO</option>
            <option value="manual">Ручная</option>
          </select>
        </label>
        <label className="history-pager-label">
          Показывать:
          <select
            className="input"
            value={historyLimit}
            onChange={(event) => {
              setHistoryLimit(event.target.value);
              setHistoryPage(1);
            }}
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="200">200</option>
            <option value="all">Все</option>
          </select>
        </label>
        <span className="history-pager-range">
          {rangeStart}-{rangeEnd} из {operationsTotal}
        </span>
        {historyLimit !== 'all' && (
          <>
            <button
              className="btn"
              type="button"
              disabled={historyPage <= 1}
              onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
            >
              Назад
            </button>
            <span className="history-pager-range">
              Стр. {historyPage} / {totalPages}
            </span>
            <button
              className="btn"
              type="button"
              disabled={historyPage >= totalPages}
              onClick={() => setHistoryPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Вперед
            </button>
          </>
        )}
      </div>
      <OperationsHistory
        title="История отгрузок"
        operations={sortedOperations}
        onDelete={(id) => deleteMutation.mutate(id)}
        onEdit={openEditModal}
        canEditOperation={(operation) => resolveShipmentKind(operation) === 'manual'}
        enableBulkDelete
        enableSorting
        sort={historySort}
        onSort={toggleSort}
        showOperationType
        resolveOperationTypeLabel={resolveShipmentKindLabel}
        onBulkDelete={(ids) => {
          if (!ids?.length) return;
          if (!window.confirm(`Удалить выбранные отгрузки (${ids.length}) и вернуть остатки по ним?`)) {
            return;
          }
          bulkDeleteMutation.mutate(ids);
        }}
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Новая отгрузка"
        size="lg"
        footer={
          <button className="btn-cancel" type="button" onClick={() => setAddOpen(false)}>
            Закрыть
          </button>
        }
      >
        <OperationBuilder
          type="shipment"
          products={productsQuery.data || []}
          onSubmit={submit}
          loading={createMutation.isPending}
          stockLimited
          allowNegativeWithCorrection
        />
      </Modal>

      <ShipmentEditModal
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditForm(null); }}
        form={editLoading ? null : editForm}
        products={productsQuery.data || []}
        loading={updateMutation.isPending}
        onSubmit={submitEdit}
      />

      <Modal
        open={shipmentSyncOpen}
        onClose={closeShipmentSyncModal}
        title="Синхронизация Ozon"
        size="xl"
        footer={
          <>
            {shipmentSyncTab === 'fbs' && (
              <>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    if (fbsSyncRunning) {
                      cancelFbsSyncMutation.mutate();
                      return;
                    }
                    startFbsSync();
                  }}
                  disabled={cancelFbsSyncMutation.isPending}
                >
                  {fbsSyncRunning ? 'Отмена' : 'Синхронизация FBS'}
                </button>
                {fbsSyncCompleted && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => applyFbsMutation.mutate(null)}
                    disabled={applyFbsMutation.isPending || sortedFbsDays.length === 0}
                  >
                    {applyFbsMutation.isPending ? 'Применение...' : 'Применить FBS'}
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => applyFbsCsvMutation.mutate(fbsCsvDays)}
                  disabled={applyFbsCsvMutation.isPending || fbsCsvDays.length === 0}
                >
                  {applyFbsCsvMutation.isPending ? 'Проведение...' : 'Провести FBS из CSV'}
                </button>
              </>
            )}
            {shipmentSyncTab === 'fbo' && (
              <>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    if (fboSyncRunning) {
                      cancelFboSyncMutation.mutate();
                      return;
                    }
                    startFboSync();
                  }}
                  disabled={cancelFboSyncMutation.isPending}
                >
                  {fboSyncRunning ? 'Отмена' : 'Синхронизация FBO'}
                </button>
                {fboSyncCompleted && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => applyFboMutation.mutate(null)}
                    disabled={applyFboMutation.isPending || sortedFboDays.length === 0}
                  >
                    {applyFboMutation.isPending ? 'Применение...' : 'Применить FBO'}
                  </button>
                )}
              </>
            )}
            <button className="btn-cancel" type="button" onClick={closeShipmentSyncModal}>
              Закрыть
            </button>
          </>
        }
      >
            <div className="shipment-sync-tabs">
              <button
                className={`shipment-sync-tab ${shipmentSyncTab === 'fbs' ? 'active' : ''}`}
                type="button"
                onClick={() => setShipmentSyncTab('fbs')}
              >
                FBS
              </button>
              <button
                className={`shipment-sync-tab ${shipmentSyncTab === 'fbo' ? 'active' : ''}`}
                type="button"
                onClick={() => setShipmentSyncTab('fbo')}
              >
                FBO
              </button>
            </div>

            {shipmentSyncTab === 'fbs' && (
              <div className="shipment-sync-panel">
                {fbsSyncMessages.length > 0 && (
                  <div className="import-result">
                    {fbsSyncMessages.map((message, index) => (
                      <div key={`${message}-${index}`}>{message}</div>
                    ))}
                  </div>
                )}
                {fbsSyncError && <div className="import-error">{fbsSyncError}</div>}

            <div className="card">
              <h4>Импорт FBS из CSV</h4>
              <p className="import-subtitle">
                Фильтр: если Статус = &quot;Отменён&quot; и &quot;Фактическая дата передачи в доставку&quot; пустая, строка пропускается.
              </p>
              <div className="form-row two-cols">
                <div className="stack-sm">
                  <span>CSV файл из кабинета Ozon</span>
                  <label className="btn import-file-btn">
                    Загрузить CSV
                    <input
                      className="hidden-input"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        parseFbsCsv(file);
                      }}
                    />
                  </label>
                </div>
              </div>
              {fbsCsvFileName && <div className="import-file-name">Файл: {fbsCsvFileName}</div>}
              {fbsCsvError && <div className="import-error">{fbsCsvError}</div>}
              {fbsCsvApplyReport?.summary && (
                <div className={fbsCsvApplyReport.summary.errors ? 'import-error' : 'import-result'}>
                  Проведение CSV: успешно {fbsCsvApplyReport.summary.success || 0} из {fbsCsvApplyReport.summary.total || 0}
                  {` · ошибок ${fbsCsvApplyReport.summary.errors || 0}`}
                </div>
              )}
              {Array.isArray(fbsCsvApplyReport?.details) &&
                fbsCsvApplyReport.details.some((d) => d.status === 'error') && (
                  <div className="stack-sm">
                    <div className="import-error">
                      Дни с ошибками не проводятся частично: если в дне есть хотя бы одна ошибка, отгрузка за этот день
                      полностью откатывается.
                    </div>
                    {fbsCsvApplyReport.details
                      .filter((d) => d.status === 'error')
                      .map((d) => (
                        <div className="import-error" key={`csv-err-${d.day}`}>
                          <div>
                            <strong>{d.day}</strong>: {d.error || `ошибок ${d.errorCount || 0}`}
                            {d.errorCount ? ' · день откатан целиком' : ''}
                          </div>
                          {Array.isArray(d.errors) && d.errors.length > 0 && (
                            <div className="stack-sm">
                              {d.errors.map((text, idx) => (
                                <div key={`csv-err-line-${d.day}-${idx}`}>
                                  {idx + 1}. {text}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              {fbsCsvDays.length > 0 && (
                <div className="stack-sm">
                  <div className="import-result">
                    Дней: <strong>{fbsCsvDays.length}</strong> · Заказов:{' '}
                    <strong>{fbsCsvDays.reduce((sum, day) => sum + Number(day.orderCount || 0), 0)}</strong> ·
                    SKU: <strong>{fbsCsvDays.reduce((sum, day) => sum + Number(day.skuCount || 0), 0)}</strong> ·
                    Штук: <strong>{fbsCsvDays.reduce((sum, day) => sum + Number(day.itemsCount || 0), 0)}</strong>
                  </div>
                  {fbsCsvAnalyzeLoading && (
                    <div className="import-result">Анализ загруженного CSV...</div>
                  )}
                  {fbsCsvAnalysis?.summary && !fbsCsvAnalyzeLoading && (
                    <div className="import-result">
                      Анализ: без изменений <strong>{fbsCsvAnalysis.summary.unchanged || 0}</strong> ·
                      новых <strong>{fbsCsvAnalysis.summary.new || 0}</strong> ·
                      будут обновлены <strong>{fbsCsvAnalysis.summary.updated || 0}</strong> ·
                      с проблемами <strong>{fbsCsvAnalysis.summary.withIssues || 0}</strong>
                    </div>
                  )}
                  <div className="ozon-days-list">
                    {fbsCsvDays.map((day) => {
                      const isOpen = expandedFbsDay === day.day;
                      const analysis = fbsCsvAnalysisByDay.get(day.day);
                      const status = String(analysis?.status || '');
                      const dayClass = status === 'unchanged'
                        ? 'ozon-day-card is-unchanged'
                        : status.startsWith('new')
                          ? 'ozon-day-card is-new'
                          : status.startsWith('updated')
                            ? 'ozon-day-card is-updated'
                            : 'ozon-day-card';
                      return (
                        <div className={dayClass} key={`csv-${day.day}`}>
                          <button
                            className="ozon-day-head"
                            type="button"
                            onClick={() => setExpandedFbsDay((prev) => (prev === day.day ? '' : day.day))}
                          >
                            <span className="ozon-day-title">{day.day}</span>
                            <span className="ozon-day-meta">
                              Заказов: {day.orderCount || 0} · SKU: {day.skuCount || 0} · Штук: {day.itemsCount || 0}
                            </span>
                            {analysis?.statusLabel && (
                              <span className={`match-pill ${
                                status === 'unchanged'
                                  ? 'match-pill-found'
                                  : status.startsWith('new')
                                    ? 'match-pill-found'
                                    : status.startsWith('updated')
                                      ? 'match-pill-missing'
                                      : ''
                              }`}>
                                {analysis.statusLabel}
                              </span>
                            )}
                          </button>
                          {analysis?.hasExisting && (
                            <div className="ozon-day-meta">
                              Уже проведено: операция #{analysis.existingOperationId} · было {analysis.existingTotal} шт.
                              · в CSV {analysis.incomingMatchedTotal} шт.
                              {analysis.unmatchedCount ? ` · несопоставлено ${analysis.unmatchedCount}` : ''}
                            </div>
                          )}
                          {isOpen && (
                            <div className="table-wrap">
                              <table className="table compact table-compact">
                                <thead>
                                  <tr>
                                    <th>SKU</th>
                                    <th>Артикул OZON</th>
                                    <th>Наименование</th>
                                    <th>Кол-во</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(day.items || []).map((item, idx) => (
                                    <tr key={`csv-${day.day}-${item.sku}-${idx}`}>
                                      <td>{item.sku}</td>
                                      <td>{item.offer_id || '—'}</td>
                                      <td>
                                        <span className="cell-ellipsis cell-name" title={item.name}>
                                          {item.name}
                                        </span>
                                      </td>
                                      <td>{item.quantity}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {sortedFbsDays.length > 0 && (
              <div className="stack-sm">
                <div className="import-result">
                  Всего заказов: <strong>{fbsSummary.orders}</strong> · Всего товаров (шт):{' '}
                  <strong>{fbsSummary.items}</strong>
                </div>
                <div className="ozon-days-list">
                  {sortedFbsDays.map((day) => {
                    const isOpen = expandedFbsDay === day.day;
                    return (
                      <div className="ozon-day-card" key={day.day}>
                        <button
                          className="ozon-day-head"
                          type="button"
                          onClick={() => setExpandedFbsDay((prev) => (prev === day.day ? '' : day.day))}
                        >
                          <span className="ozon-day-title">{day.day}</span>
                          <span className="ozon-day-meta">
                            Заказов: {day.orderCount || 0} · SKU: {day.skuCount || 0} · Штук: {day.itemsCount || 0}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="table-wrap">
                            <table className="table compact table-compact">
                              <thead>
                                <tr>
                                  <th>SKU</th>
                                  <th>Наименование</th>
                                  <th>Кол-во</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(day.items || []).map((item) => (
                                  <tr key={`${day.day}-${item.sku}`}>
                                    <td>{item.sku}</td>
                                    <td>
                                      <span className="cell-ellipsis cell-name" title={item.name}>
                                        {item.name}
                                      </span>
                                    </td>
                                    <td>{item.quantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
            )}

            {shipmentSyncTab === 'fbo' && (
              <div className="shipment-sync-panel">
                {fboSyncMessages.length > 0 && (
                  <div className="import-result">
                    {fboSyncMessages.map((message, index) => (
                      <div key={`${message}-${index}`}>{message}</div>
                    ))}
                  </div>
                )}
                {fboSyncError && <div className="import-error">{fboSyncError}</div>}

                {sortedFboDays.length > 0 && (
              <div className="stack-sm">
                <div className="import-result">
                  Всего поставок: <strong>{fboSummary.supplies}</strong> · Всего товаров (шт):{' '}
                  <strong>{fboSummary.items}</strong>
                </div>
                <div className="ozon-days-list">
                  {sortedFboDays.map((day) => {
                    const dayOpen = expandedFboDay === day.day;
                    return (
                      <div className="ozon-day-card" key={day.day}>
                        <button
                          className="ozon-day-head"
                          type="button"
                          onClick={() => setExpandedFboDay((prev) => (prev === day.day ? '' : day.day))}
                        >
                          <span className="ozon-day-title">{day.day}</span>
                          <span className="ozon-day-meta">
                            Поставок: {day.supplyCount || 0} · SKU: {day.skuCount || 0} · Штук: {day.itemsCount || 0}
                          </span>
                        </button>

                        {dayOpen && (
                          <div className="fbo-supplies-list">
                            {(day.supplies || []).map((supply) => {
                              return (
                                <div className="fbo-supply-card" key={supply.id}>
                                  <div className="ozon-day-head">
                                    <span className="ozon-day-title">
                                      Поставка #{supply.order_number || supply.order_id}
                                    </span>
                                    <span className="ozon-day-meta">
                                      Склад: {supply.warehouse_name || '—'} · Штук: {supply.itemCount || 0}
                                    </span>
                                  </div>
                                  <div className="fbo-bundle-id">
                                    Bundle ID: <strong>{String(supply.bundle_id || '—')}</strong>
                                  </div>
                                  <div className="table-wrap">
                                    <table className="table compact table-compact">
                                      <thead>
                                        <tr>
                                          <th>Фото</th>
                                          <th>SKU</th>
                                          <th>Наименование</th>
                                          <th>Кол-во</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(supply.items || []).map((item, idx) => (
                                          <tr key={`${supply.id}-${item.sku}-${idx}`}>
                                            <td>
                                              {item.icon_path ? (
                                                <img className="product-icon" src={item.icon_path} alt={item.name || item.sku} loading="lazy" />
                                              ) : (
                                                '—'
                                              )}
                                            </td>
                                            <td>{`OZN${item.sku}`}</td>
                                            <td>
                                              <span className="cell-ellipsis cell-name" title={item.name}>
                                                {item.name}
                                              </span>
                                            </td>
                                            <td>{item.quantity}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

              </div>
            )}
      </Modal>
    </div>
  );
}
