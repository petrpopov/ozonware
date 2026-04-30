import { api } from './http.js';

export const services = {
  getProducts: (search = '', { includeInactive = false } = {}) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (includeInactive) params.set('includeInactive', 'true');
    const qs = params.toString();
    return api.get(`/products${qs ? `?${qs}` : ''}`);
  },
  getProductById: (id) => api.get(`/products/${id}`),
  getProductUsage: (id) => api.get(`/products/${id}/usage`),
  createProduct: (payload) => api.post('/products', payload),
  updateProduct: (id, payload) => api.put(`/products/${id}`, payload),
  deleteProduct: (id) => api.del(`/products/${id}`),

  getProductFields: () => api.get('/product-fields'),
  createProductField: (payload) => api.post('/product-fields', payload),
  updateProductField: (id, payload) => api.put(`/product-fields/${id}`, payload),
  deleteProductField: (id) => api.del(`/product-fields/${id}`),

  getOperations: ({ filter, page = 0, size = 20, sort = 'operationDate,desc' } = {}) => {
    const params = new URLSearchParams({ page: String(page), size: String(size), sort });
    if (filter) params.set('filter', filter);
    return api.get(`/operations?${params}`);
  },
  getProductsPage: ({ search = '', page = 0, size = 20, sort = 'id,desc', hideZeroStock = false, includeInactive = false } = {}) => {
    const params = new URLSearchParams({ page: String(page), size: String(size), sort });
    if (search) params.set('search', search);
    if (hideZeroStock) params.set('hideZeroStock', 'true');
    if (includeInactive) params.set('includeInactive', 'true');
    return api.get(`/products?${params}`);
  },

  importProductsCatalog: (items) => api.post('/products/catalog/import', { items }),

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

  getAppSetting: (key) => api.get(`/settings/${encodeURIComponent(key)}`).catch(() => null),
  saveAppSetting: (key, value) => api.post(`/settings/${encodeURIComponent(key)}`, { value }),

  resetWarehouseState: () => api.post('/maintenance/reset-state', {}),

  getDictionary: (name) => api.get(`/dictionaries/${name}`),
  createDictionaryItem: (name, body) => api.post(`/dictionaries/${name}`, body),
  updateDictionaryItem: (name, id, body) => api.patch(`/dictionaries/${name}/${id}`, body),
  deleteDictionaryItem: (name, id) => api.del(`/dictionaries/${name}/${id}`),

  getPlannedSupplies: ({ includeClosed = false, page = 0, size = 200 } = {}) => {
    const params = new URLSearchParams({ page: String(page), size: String(size), sort: 'purchaseDate,desc' });
    if (!includeClosed) params.set('filter', 'status!=closed');
    return api.get(`/planned-supplies?${params}`);
  },
  getPlannedSuppliesPage: ({ filter, page = 0, size = 20, sort = 'purchaseDate,desc' } = {}) => {
    const params = new URLSearchParams({ page: String(page), size: String(size), sort });
    if (filter) params.set('filter', filter);
    return api.get(`/planned-supplies?${params}`);
  },
  getPlannedSupplyById: (id) => api.get(`/planned-supplies/${id}`),
  createPlannedSupply: (payload) => api.post('/planned-supplies', payload),
  updatePlannedSupply: (id, payload) => api.put(`/planned-supplies/${id}`, payload),
  deletePlannedSupply: (id) => api.del(`/planned-supplies/${id}`),
  closePlannedSupply: (id, note) => api.post(`/planned-supplies/${id}/close`, { note }),
  updatePlannedSupplyDates: (id, purchaseDate, expectedDate) => api.patch(`/planned-supplies/${id}/dates`, { purchase_date: purchaseDate || null, expected_date: expectedDate || null }),
};
