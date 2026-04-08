import { apiCall } from './api.js';
import { products, operations, loadData } from './state.js';
import { renderProducts, showAlert as showGlobalAlert } from './products.js';

export function createOperation(config) {
    let data = {};

    function start() {
        data = {};
        if (config.titleId) {
            document.getElementById(config.titleId).textContent = config.titles.create;
        }
        if (config.idInputId) {
            document.getElementById(config.idInputId).value = '';
        }
        document.getElementById(config.modalId).classList.add('active');

        const today = new Date().toISOString().split('T')[0];
        document.getElementById(config.dateId).value = today;

        if (config.searchInputId) {
            document.getElementById(config.searchInputId).value = '';
            document.getElementById(config.searchResultsId).innerHTML = '';
            const searchInput = document.getElementById(config.searchInputId);
            searchInput.oninput = () => search();
            searchInput.focus();
        }
        if (config.noteId) {
            document.getElementById(config.noteId).value = '';
        }
        renderItems();
    }

    function edit(operationId) {
        const operation = operations.find(op => op.id === operationId);
        if (!operation || !operation.items) return;

        data = {};
        if (config.titleId) {
            document.getElementById(config.titleId).textContent = config.titles.edit;
        }
        if (config.idInputId) {
            document.getElementById(config.idInputId).value = operationId;
        }
        document.getElementById(config.modalId).classList.add('active');

        document.getElementById(config.dateId).value =
            operation.operation_date || new Date(operation.date).toISOString().split('T')[0];

        operation.items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                data[product.id] = {
                    product,
                    quantity: item.quantity
                };
            }
        });

        if (config.searchInputId) {
            document.getElementById(config.searchInputId).value = '';
            document.getElementById(config.searchResultsId).innerHTML = '';
            const searchInput = document.getElementById(config.searchInputId);
            searchInput.oninput = () => search();
        }
        if (config.noteId) {
            document.getElementById(config.noteId).value = operation.note || '';
        }
        renderItems();
    }

    function search() {
        const query = document.getElementById(config.searchInputId).value.trim().toLowerCase();
        const resultsContainer = document.getElementById(config.searchResultsId);

        if (!query) {
            resultsContainer.innerHTML = '';
            return;
        }

        const filtered = products.filter(p => {
            if (p.sku && p.sku.toLowerCase().includes(query)) return true;
            if (p.name.toLowerCase().includes(query)) return true;
            return false;
        }).slice(0, 10);

        if (filtered.length === 0) {
            resultsContainer.innerHTML = '<p style="padding: 10px; color: #6c757d;">Товары не найдены</p>';
            return;
        }

        resultsContainer.innerHTML = filtered.map(product => `
            <div class="search-result-item" onclick="${config.addFnName}(${product.id})">
                <div class="search-result-name">${product.name}</div>
                <div class="search-result-sku">SKU: <code>${product.sku}</code> • Остаток: ${product.quantity}</div>
            </div>
        `).join('');
    }

    function add(productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        if (data[productId]) {
            data[productId].quantity += config.defaultQuantity;
        } else {
            data[productId] = {
                product,
                quantity: config.defaultQuantity
            };
        }

        renderItems();
        showOperationAlert(`✅ ${product.name} добавлен`, 'success');

        if (config.searchInputId) {
            document.getElementById(config.searchInputId).value = '';
            document.getElementById(config.searchResultsId).innerHTML = '';
            document.getElementById(config.searchInputId).focus();
        }
    }

    function updateQuantity(productId, qty) {
        const q = parseInt(qty);
        if (q > 0 && data[productId]) {
            data[productId].quantity = q;
            renderItems();
        }
    }

    function remove(productId) {
        delete data[productId];
        renderItems();
    }

    function renderItems() {
        const container = document.getElementById(config.itemsContainerId);
        const countElement = document.getElementById(config.itemsCountId);
        const items = Object.values(data);
        countElement.textContent = items.length;

        if (config.totalQuantityId) {
            const totalQty = items.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);
            document.getElementById(config.totalQuantityId).textContent = totalQty;
        }

        if (items.length === 0) {
            container.innerHTML = `<p style="color: #6c757d; text-align: center; padding: 20px;">${config.emptyMessage}</p>`;
            if (config.totalQuantityId) {
                document.getElementById(config.totalQuantityId).textContent = '0';
            }
            return;
        }

        container.innerHTML = items.map(item => {
            const isOverStock = config.showStockWarning && item.quantity > item.product.quantity;
            const warningStyle = isOverStock ? 'border-left-color: #dc3545; background: #fff5f5;' : '';
            const warningText = isOverStock ? '<br><span style="color: #dc3545; font-weight: 600;">⚠️ Недостаточно товара!</span>' : '';
            const inputStyle = isOverStock ? 'border-color: #dc3545;' : '';
            const maxAttr = config.showStockWarning ? ` max="${item.product.quantity}"` : '';

            return `
                <div class="receipt-item" style="${warningStyle}">
                    <div class="receipt-item-info">
                        <div class="receipt-item-name">${item.product.name}</div>
                        <div class="receipt-item-sku">SKU: <code>${item.product.sku}</code> • Текущий остаток: ${item.product.quantity}${warningText}</div>
                    </div>
                    <div class="receipt-item-controls">
                        <input type="number" class="receipt-quantity-input" value="${item.quantity}" min="1"${maxAttr}
                            onchange="${config.updateQtyFnName}(${item.product.id}, this.value)"
                            style="${inputStyle}">
                        <button class="btn btn-danger btn-icon" onclick="${config.removeFnName}(${item.product.id})"
                            title="Удалить">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function showOperationAlert(message, type) {
        if (!config.alertId) return;
        const alertDiv = document.getElementById(config.alertId);
        alertDiv.innerHTML = `<div class="scan-${type}">${message}</div>`;
        setTimeout(() => { alertDiv.innerHTML = ''; }, 2000);
    }

    function cancel() {
        if (Object.keys(data).length > 0) {
            if (!confirm(config.cancelMessage)) return;
        }
        document.getElementById(config.modalId).classList.remove('active');
        data = {};
    }

    async function complete() {
        if (Object.keys(data).length === 0) {
            alert(config.emptyValidationMessage);
            return;
        }

        const operationId = config.idInputId ? document.getElementById(config.idInputId).value : '';
        const dateValue = document.getElementById(config.dateId).value;
        const note = config.noteId ? document.getElementById(config.noteId).value.trim() : '';

        if (!dateValue) {
            alert(config.emptyDateMessage);
            return;
        }

        if (config.validateBeforeComplete) {
            const error = config.validateBeforeComplete(data);
            if (error) {
                alert(error);
                return;
            }
        }

        const confirmText = operationId ? config.editConfirmText : config.createConfirmText;
        if (!confirm(`${confirmText}\nТоваров: ${Object.keys(data).length}`)) {
            return;
        }

        const items = config.buildItems ? config.buildItems(data) :
            Object.values(data).map(item => ({
                productId: item.product.id,
                productName: item.product.name,
                productSKU: item.product.sku,
                quantity: item.quantity
            }));

        const totalQuantity = Object.values(data).reduce((sum, item) => sum + parseInt(item.quantity), 0);

        try {
            if (operationId) {
                await apiCall(`/api/operations/${operationId}`, 'PUT', {
                    operation_date: dateValue, note, items, total_quantity: totalQuantity
                });
            } else {
                await apiCall('/api/operations', 'POST', {
                    type: config.type, operation_date: dateValue, note, items, total_quantity: totalQuantity
                });
            }

            document.getElementById(config.modalId).classList.remove('active');
            data = {};

            await loadData();
            await renderProducts();
            if (config.onComplete) await config.onComplete();

            const message = operationId ? config.editSuccessMessage : config.createSuccessMessage;
            showGlobalAlert(message, 'success');
        } catch (error) {
            console.error(`Error completing ${config.type}:`, error);
            showOperationAlert('Ошибка: ' + error.message, 'error');
        }
    }

    return {
        start, edit, search, add, updateQuantity, remove,
        renderItems, complete, cancel, showAlert: showOperationAlert,
        getData: () => data,
        setData: (d) => { data = d; }
    };
}
