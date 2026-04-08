import { API_URL } from './api.js';

// ==================== GLOBAL STATE ====================
export let products = [];
export let operations = [];
export let customFieldsTemplate = [];
export let barcodesTemplate = [];
export let productFieldsSettings = [];
export let columnsOrder = [];

export function setProducts(val) { products = val; }
export function setOperations(val) { operations = val; }
export function setCustomFieldsTemplate(val) { customFieldsTemplate = val; }
export function setBarcodesTemplate(val) { barcodesTemplate = val; }
export function setProductFieldsSettings(val) { productFieldsSettings = val; }
export function setColumnsOrder(val) { columnsOrder = val; }

export function getDefaultColumnsOrder() {
    return ['#', 'name', 'sku', ...productFieldsSettings.map(f => f.name), 'quantity', 'actions'];
}

export async function loadData() {
    const [productsResponse, operationsResponse, productFieldsResponse] = await Promise.all([
        fetch(`${API_URL}/api/products`),
        fetch(`${API_URL}/api/operations`),
        fetch(`${API_URL}/api/product-fields`)
    ]);

    products = await productsResponse.json();
    operations = await operationsResponse.json();
    productFieldsSettings = await productFieldsResponse.json();
    productFieldsSettings = productFieldsSettings.map((field) => ({
        ...field,
        showInTable: field.show_in_table !== undefined ? field.show_in_table : field.showInTable
    }));

    // Load columns order
    const savedOrder = localStorage.getItem('warehouse_columns_order');
    if (savedOrder) {
        try {
            columnsOrder = JSON.parse(savedOrder);
        } catch (e) {
            columnsOrder = getDefaultColumnsOrder();
        }
    } else {
        columnsOrder = getDefaultColumnsOrder();
    }
}
