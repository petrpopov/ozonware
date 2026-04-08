import { apiCall } from './api.js';
import { products, operations, loadData } from './state.js';
import { renderProducts, showAlert } from './products.js';

let updateReportsFn = null;
export function setUpdateReports(fn) { updateReportsFn = fn; }

let writeoffsList = [];
let writeoffsSummary = [];

export async function loadWriteoffs() {
    try {
        writeoffsList = await apiCall('/api/writeoffs');
        writeoffsSummary = await apiCall('/api/writeoffs/summary');
    } catch (error) {
        console.error('Error loading writeoffs:', error);
    }
}

export function startWriteoff() {
    window.writeoffData = {};
    document.getElementById('writeoffModal').classList.add('active');

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('writeoffDate').value = today;

    document.getElementById('writeoffSearchInput').value = '';
    document.getElementById('writeoffNote').value = '';
    document.getElementById('writeoffSearchResults').innerHTML = '';
    renderWriteoffItems();
}

export function searchWriteoffProduct() {
    const query = document.getElementById('writeoffSearchInput').value.toLowerCase();
    if (!query) {
        document.getElementById('writeoffSearchResults').innerHTML = '';
        return;
    }

    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query)
    ).slice(0, 5);

    const html = filtered.map(p => `
        <div class="search-result-item" onclick="addWriteoffProduct(${p.id})">
            <strong>${p.name}</strong><br>
            <small>SKU: ${p.sku} | В наличии: ${p.quantity} шт.</small>
        </div>
    `).join('');

    document.getElementById('writeoffSearchResults').innerHTML = html;
}

export function addWriteoffProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (!window.writeoffData[productId]) {
        window.writeoffData[productId] = {
            product: product,
            quantity: 1,
            reason: 'defect',
            note: ''
        };
    }

    document.getElementById('writeoffSearchInput').value = '';
    document.getElementById('writeoffSearchResults').innerHTML = '';
    renderWriteoffItems();
}

export function renderWriteoffItems() {
    const items = Object.values(window.writeoffData);
    document.getElementById('writeoffItemsCount').textContent = items.length;

    const html = items.map(item => `
        <div class="writeoff-item-card">
            <div class="writeoff-item-header">
                <div class="writeoff-item-info">
                    <strong>${item.product.name}</strong><br>
                    <small>SKU: ${item.product.sku} | В наличии: ${item.product.quantity} шт.</small>
                </div>
                <button class="btn btn-danger btn-icon" onclick="removeWriteoffItem(${item.product.id})">✕</button>
            </div>

            <div class="writeoff-item-fields">
                <div>
                    <label class="field-label">Количество</label>
                    <input type="number" min="1" max="${item.product.quantity}" value="${item.quantity}"
                           onchange="writeoffData[${item.product.id}].quantity = parseInt(this.value) || 1; renderWriteoffItems()">
                </div>

                <div>
                    <label class="field-label">Причина</label>
                    <select onchange="writeoffData[${item.product.id}].reason = this.value">
                        <option value="defect" ${item.reason === 'defect' ? 'selected' : ''}>🔴 Брак</option>
                        <option value="loss" ${item.reason === 'loss' ? 'selected' : ''}>❌ Потеря</option>
                        <option value="reserve" ${item.reason === 'reserve' ? 'selected' : ''}>🔵 Резерв</option>
                    </select>
                </div>

                <div>
                    <label class="field-label">Примечание</label>
                    <input type="text" placeholder="Необязательно..." value="${item.note || ''}"
                           onchange="writeoffData[${item.product.id}].note = this.value">
                </div>
            </div>
        </div>
    `).join('') || '<p class="empty-message">Список пуст</p>';

    document.getElementById('writeoffItems').innerHTML = html;
}

export function removeWriteoffItem(productId) {
    delete window.writeoffData[productId];
    renderWriteoffItems();
}

export function cancelWriteoff() {
    document.getElementById('writeoffModal').classList.remove('active');
    window.writeoffData = {};
}

export async function completeWriteoff() {
    const items = Object.values(window.writeoffData);
    if (items.length === 0) {
        alert('Добавьте хотя бы один товар!');
        return;
    }

    const date = document.getElementById('writeoffDate').value;
    const note = document.getElementById('writeoffNote').value;

    try {
        const totalQuantity = items.reduce((sum, item) => sum + parseInt(item.quantity), 0);

        await apiCall('/api/operations', 'POST', {
            type: 'writeoff',
            operation_date: date,
            note: note,
            items: items.map(item => ({
                productId: item.product.id,
                productName: item.product.name,
                productSKU: item.product.sku,
                quantity: parseInt(item.quantity),
                reason: item.reason,
                note: item.note || ''
            })),
            total_quantity: totalQuantity
        });

        document.getElementById('writeoffModal').classList.remove('active');
        window.writeoffData = {};

        await loadData();
        await loadWriteoffs();
        await renderProducts();
        renderWriteoffHistory();
        renderWriteoffSummary();
        if (updateReportsFn) updateReportsFn();

        showAlert(`✅ Списание на ${totalQuantity} шт. проведено`, 'success');
    } catch (error) {
        console.error('Error completing writeoff:', error);
        alert('Ошибка списания: ' + error.message);
    }
}

export function renderWriteoffHistory() {
    const writeoffOps = operations
        .filter(op => op.type === 'writeoff')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20);

    const reasonLabels = {
        defect: '🔴 Брак',
        loss: '❌ Потеря',
        reserve: '🔵 Резерв'
    };

    const html = writeoffOps.map(op => {
        if (op.items) {
            const dateStr = op.operation_date ? new Date(op.operation_date).toLocaleDateString('ru-RU') : 'Не указана';
            const createdStr = new Date(op.created_at).toLocaleString('ru-RU');

            return `
                <div class="operation-item accordion-item">
                    <div class="accordion-header" onclick="toggleAccordion('writeoff-${op.id}')">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                                <span class="accordion-icon">▶</span>
                                <div>
                                    <h4 style="margin: 0;">
                                        📝 Списание от ${dateStr}
                                        <span class="badge badge-warning">-${op.total_quantity} шт.</span>
                                    </h4>
                                    <div style="font-size: 13px; color: #6c757d; margin-top: 5px;">
                                        ${createdStr} | Товаров: ${op.items.length}
                                        ${op.note ? ` | ${op.note}` : ''}
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 5px;" onclick="event.stopPropagation()">
                                <button class="btn btn-danger btn-icon" onclick="deleteWriteoff(${op.id})" title="Удалить">🗑️</button>
                            </div>
                        </div>
                    </div>

                    <div class="accordion-content" id="writeoff-${op.id}">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <thead>
                                <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                    <th style="padding: 8px; text-align: left;">Товар</th>
                                    <th style="padding: 8px; text-align: left;">SKU</th>
                                    <th style="padding: 8px; text-align: center;">Причина</th>
                                    <th style="padding: 8px; text-align: right;">Количество</th>
                                    <th style="padding: 8px; text-align: left;">Примечание</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${op.items.map(item => `
                                    <tr style="border-bottom: 1px solid #e9ecef;">
                                        <td style="padding: 8px;">${item.productName}</td>
                                        <td style="padding: 8px;"><code>${item.productSKU}</code></td>
                                        <td style="padding: 8px; text-align: center;">${reasonLabels[item.reason] || item.reason}</td>
                                        <td style="padding: 8px; text-align: right; color: #ffc107; font-weight: bold;">-${item.quantity}</td>
                                        <td style="padding: 8px; font-size: 12px; color: #6c757d;">${item.note || '—'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
        return '';
    }).join('');

    document.getElementById('writeoffHistory').innerHTML = html || '<p style="color: #6c757d;">История пуста</p>';
}

export function renderWriteoffSummary() {
    if (!writeoffsSummary || writeoffsSummary.length === 0) {
        document.getElementById('writeoffSummary').innerHTML = '<p style="color: #6c757d;">Нет активных списаний</p>';
        return;
    }

    const reasonLabels = {
        defect: '🔴 Брак',
        loss: '❌ Потеря',
        reserve: '🔵 Резерв'
    };

    const reasonColors = {
        defect: '#dc3545',
        loss: '#6c757d',
        reserve: '#667eea'
    };

    const html = `
        <table style="width: 100%; border-collapse: collapse; background: white;">
            <thead>
                <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                    <th style="padding: 12px; text-align: left;">Товар</th>
                    <th style="padding: 12px; text-align: left;">SKU</th>
                    <th style="padding: 12px; text-align: center;">Причина</th>
                    <th style="padding: 12px; text-align: right;">Количество</th>
                    <th style="padding: 12px; text-align: right;">Операций</th>
                </tr>
            </thead>
            <tbody>
                ${writeoffsSummary.map(item => `
                    <tr style="border-bottom: 1px solid #e9ecef;">
                        <td style="padding: 12px;">${item.product_name}</td>
                        <td style="padding: 12px;"><code>${item.product_sku}</code></td>
                        <td style="padding: 12px; text-align: center;">
                            <span style="color: ${reasonColors[item.reason]}; font-weight: bold;">
                                ${reasonLabels[item.reason]}
                            </span>
                        </td>
                        <td style="padding: 12px; text-align: right; font-weight: bold; color: ${reasonColors[item.reason]};">
                            ${item.total_quantity}
                        </td>
                        <td style="padding: 12px; text-align: right; color: #6c757d;">
                            ${item.operations_count}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('writeoffSummary').innerHTML = html;
}

export async function deleteWriteoff(operationId) {
    if (!confirm('Удалить списание? Товары будут возвращены на склад.')) {
        return;
    }

    try {
        await apiCall(`/api/operations/${operationId}`, 'DELETE');
        await loadData();
        await loadWriteoffs();
        await renderProducts();
        renderWriteoffHistory();
        renderWriteoffSummary();
        if (updateReportsFn) updateReportsFn();
        showAlert('Списание отменено, товары возвращены', 'success');
    } catch (error) {
        console.error('Error deleting writeoff:', error);
        alert('Ошибка удаления: ' + error.message);
    }
}
