import { api } from './http.js';

export const services = {
  getProducts: (search = '') => api.get(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getProductById: (id) => api.get(`/products/${id}`),
  getProductUsage: (id) => api.get(`/products/${id}/usage`),
  createProduct: (payload) => api.post('/products', payload),
  updateProduct: (id, payload) => api.put(`/products/${id}`, payload),
  deleteProduct: (id) => api.del(`/products/${id}`),

  getProductFields: () => api.get('/product-fields'),
  createProductField: (payload) => api.post('/product-fields', payload),
  deleteProductField: (id) => api.del(`/product-fields/${id}`),

  getOperations: ({ type, limit, offset, includeTotal, shipmentKind } = {}) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (includeTotal) params.set('include_total', '1');
    if (type === 'shipment' && shipmentKind && shipmentKind !== 'all') {
      params.set('shipment_kind', String(shipmentKind));
    }
    const query = params.toString();
    return api.get(`/operations${query ? `?${query}` : ''}`);
  },
  getOperationById: (id) => api.get(`/operations/${id}`),
  createOperation: (payload) => api.post('/operations', payload),
  updateOperation: (id, payload) => api.put(`/operations/${id}`, payload),
  deleteOperation: (id) => api.del(`/operations/${id}`),
  bulkDeleteOperations: (ids) => api.post('/operations/bulk-delete', { ids }),

  getStats: () => api.get('/stats'),
  getWriteoffsSummary: () => api.get('/writeoffs/summary'),

  getGoogleConfig: () => api.get('/google-sheets-config'),
  saveGoogleConfig: (payload) => api.post('/google-sheets-config', payload),
  testGoogleConfig: (payload) => api.post('/google-sheets-test', payload),
  syncGoogle: (payload) => api.post('/google-sheets-sync', payload),

  getOzonSettings: () => api.get('/ozon/settings'),
  saveOzonSettings: (payload) => api.post('/ozon/settings', payload),
  getOzonShipments: () => api.get('/ozon/shipments'),
  getOzonFboSupplies: () => api.get('/ozon/fbo/supplies'),
  syncOzonProducts: () => api.post('/ozon/products/sync', {}),
  processOzonShipments: (payload) => api.post('/ozon/shipments', payload),
  processOzonFbsShipments: (payload) => api.post('/ozon/shipments', payload || {}),
  processOzonFbsShipmentsFromCsv: (payload) => api.post('/ozon/fbs/shipments-from-csv', payload || {}),
  analyzeOzonFbsCsv: (payload) => api.post('/ozon/fbs/csv-analyze', payload || {}),
  processOzonFboShipments: (payload) => api.post('/ozon/fbo/shipments', payload || {}),
  cancelOzonFbsSync: () => api.post('/ozon/fbs/cancel', {}),
  cancelOzonFboSync: () => api.post('/ozon/fbo/cancel', {}),
  importOzonOrdersCsvRows: (payload) => api.post('/ozon/orders/import', payload),
  getOzonOrderImports: (limit = 20) => api.get(`/ozon/orders/imports?limit=${encodeURIComponent(String(limit))}`),
  getProductOrderStats: (productId) => api.get(`/ozon/orders/product/${productId}/stats`),
  getProductTimeline: (productId, params = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));
    if (params.all) query.set('all', '1');
    const qs = query.toString();
    return api.get(`/ozon/orders/product/${productId}/timeline${qs ? `?${qs}` : ''}`);
  },

  resetWarehouseState: () => api.post('/maintenance/reset-state', {})
};
