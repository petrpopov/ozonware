import { createOperation } from './operationBase.js';
import { apiCall } from './api.js';
import { operations, loadData } from './state.js';
import { renderProducts, showAlert } from './products.js';

let updateReportsFn = null;
export function setUpdateReports(fn) { updateReportsFn = fn; }

const receipt = createOperation({
    type: 'receipt',
    modalId: 'receiptModal',
    titleId: 'receiptModalTitle',
    idInputId: 'receiptId',
    dateId: 'receiptDate',
    searchInputId: 'receiptSearchInput',
    searchResultsId: 'receiptSearchResults',
    noteId: 'receiptNote',
    itemsCountId: 'receiptItemsCount',
    totalQuantityId: 'receiptTotalQuantity',
    itemsContainerId: 'receiptItems',
    alertId: 'receiptAlert',
    defaultQuantity: 10,
    addFnName: 'addToReceipt',
    updateQtyFnName: 'updateReceiptQuantity',
    removeFnName: 'removeFromReceipt',
    titles: { create: '📦 Приход товаров', edit: '✏️ Редактировать приход' },
    emptyMessage: 'Добавьте товары в приход',
    cancelMessage: 'Отменить приход? Все добавленные товары будут потеряны.',
    emptyValidationMessage: 'Добавьте хотя бы один товар в приход!',
    emptyDateMessage: 'Укажите дату прихода!',
    createConfirmText: 'Провести приход?',
    editConfirmText: 'Сохранить изменения в приходе?',
    createSuccessMessage: 'Приход проведен успешно!',
    editSuccessMessage: 'Приход обновлен!',
    onComplete: () => {
        renderReceiptHistory();
        if (updateReportsFn) updateReportsFn();
    }
});

export const startReceipt = () => receipt.start();
export const editReceipt = (id) => receipt.edit(id);
export const addToReceipt = (id) => receipt.add(id);
export const updateReceiptQuantity = (id, qty) => receipt.updateQuantity(id, qty);
export const removeFromReceipt = (id) => receipt.remove(id);
export const completeReceipt = () => receipt.complete();
export const cancelReceipt = () => receipt.cancel();
export const getReceiptData = () => receipt.getData();

export function renderReceiptHistory() {
    const receiptOps = operations
        .filter(op => op.type === 'receipt')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20);

    const html = receiptOps.map(op => {
        if (op.items) {
            const receiptDateStr = op.operation_date ? new Date(op.operation_date).toLocaleDateString('ru-RU') : 'Не указана';
            const createdDateStr = new Date(op.created_at).toLocaleString('ru-RU');

            return `
                <div class="operation-item accordion-item">
                    <div class="accordion-header" onclick="toggleAccordion('receipt-${op.id}')">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                                <span class="accordion-icon">▶</span>
                                <div>
                                    <h4 style="margin: 0;">
                                        📦 Приход от ${receiptDateStr}
                                        <span class="badge badge-success">+${op.total_quantity} шт.</span>
                                    </h4>
                                    <div style="font-size: 13px; color: #6c757d; margin-top: 5px;">
                                        ${createdDateStr} | Товаров: ${op.items.length}
                                        ${op.note ? ` | ${op.note}` : ''}
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 5px;" onclick="event.stopPropagation()">
                                <button class="btn btn-primary btn-icon" onclick="editReceipt(${op.id})" title="Редактировать">✏️</button>
                                <button class="btn btn-danger btn-icon" onclick="deleteReceipt(${op.id})" title="Удалить">🗑️</button>
                            </div>
                        </div>
                    </div>

                    <div class="accordion-content" id="receipt-${op.id}">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 10px;">
                            <thead>
                                <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                    <th style="padding: 8px; text-align: left; font-weight: 600;">Товар</th>
                                    <th style="padding: 8px; text-align: left; font-weight: 600;">SKU</th>
                                    <th style="padding: 8px; text-align: right; font-weight: 600;">Количество</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${op.items.map(item => `
                                    <tr style="border-bottom: 1px solid #e9ecef;">
                                        <td style="padding: 8px;">${item.productName}</td>
                                        <td style="padding: 8px;"><code>${item.productSKU}</code></td>
                                        <td style="padding: 8px; text-align: right; color: #28a745; font-weight: bold;">+${item.quantity}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
        return `
            <div class="operation-item">
                <h4>${op.productName} <span class="badge badge-success">+${op.quantity}</span></h4>
                <div class="details">
                    ${new Date(op.date).toLocaleString('ru-RU')}<br>
                    ${op.note ? `Примечание: ${op.note}` : ''}
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('receiptHistory').innerHTML =
        receiptOps.length ? '<h3>История приходов</h3>' + html : '';
}

export async function deleteReceipt(operationId) {
    const operation = operations.find(op => op.id === operationId);
    if (!operation) return;

    const itemsInfo = operation.items
        ? `Товаров: ${operation.items.length}, общее количество: ${operation.totalQuantity}`
        : `${operation.productName}: ${operation.quantity} шт.`;

    if (!confirm(`Удалить приход?\n${itemsInfo}\n\nОстатки товаров будут откатаны.`)) {
        return;
    }

    try {
        await apiCall(`/api/operations/${operationId}`, 'DELETE');
        await loadData();
        await renderProducts();
        renderReceiptHistory();
        if (updateReportsFn) updateReportsFn();
        showAlert('Приход удален, остатки откатаны', 'success');
    } catch (error) {
        console.error('Error deleting receipt:', error);
        showAlert('Ошибка удаления: ' + error.message, 'error');
    }
}
