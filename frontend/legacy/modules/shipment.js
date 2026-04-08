import { createOperation } from './operationBase.js';
import { apiCall } from './api.js';
import { operations, loadData } from './state.js';
import { renderProducts, showAlert } from './products.js';

let updateReportsFn = null;
export function setUpdateReports(fn) { updateReportsFn = fn; }

const shipment = createOperation({
    type: 'shipment',
    modalId: 'shipmentModal',
    titleId: 'shipmentModalTitle',
    idInputId: 'shipmentId',
    dateId: 'shipmentDate',
    searchInputId: 'shipmentSearchInput',
    searchResultsId: 'shipmentSearchResults',
    noteId: 'shipmentNote',
    itemsCountId: 'shipmentItemsCount',
    totalQuantityId: 'shipmentTotalQuantity',
    itemsContainerId: 'shipmentItems',
    alertId: 'shipmentAlert',
    defaultQuantity: 1,
    showStockWarning: true,
    addFnName: 'addToShipment',
    updateQtyFnName: 'updateShipmentQuantity',
    removeFnName: 'removeFromShipment',
    titles: { create: '📤 Отгрузка товаров', edit: '✏️ Редактировать отгрузку' },
    emptyMessage: 'Добавьте товары в отгрузку',
    cancelMessage: 'Отменить отгрузку? Все добавленные товары будут потеряны.',
    emptyValidationMessage: 'Добавьте хотя бы один товар в отгрузку!',
    emptyDateMessage: 'Укажите дату отгрузки!',
    createConfirmText: 'Провести отгрузку?',
    editConfirmText: 'Сохранить изменения в отгрузке?',
    createSuccessMessage: 'Отгрузка проведена успешно!',
    editSuccessMessage: 'Отгрузка обновлена!',
    validateBeforeComplete: (data) => {
        for (let item of Object.values(data)) {
            if (item.product.quantity < item.quantity) {
                return `Недостаточно товара "${item.product.name}" на складе!\nОстаток: ${item.product.quantity}, требуется: ${item.quantity}`;
            }
        }
        return null;
    },
    onComplete: () => {
        renderShipmentHistory();
        if (updateReportsFn) updateReportsFn();
    }
});

export const startShipment = () => shipment.start();
export const editShipment = (id) => shipment.edit(id);
export const addToShipment = (id) => shipment.add(id);
export const updateShipmentQuantity = (id, qty) => shipment.updateQuantity(id, qty);
export const removeFromShipment = (id) => shipment.remove(id);
export const completeShipment = () => shipment.complete();
export const cancelShipment = () => shipment.cancel();
export const getShipmentData = () => shipment.getData();

export function renderShipmentHistory() {
    const shipmentOps = operations
        .filter(op => op.type === 'shipment')
        .sort((a, b) => new Date(b.operation_date) - new Date(a.operation_date))
        .slice(0, 20);

    const html = shipmentOps.map(op => {
        if (op.items) {
            const shipmentDateStr = op.operation_date ? new Date(op.operation_date).toLocaleDateString('ru-RU') : 'Не указана';
            const createdDateStr = new Date(op.created_at).toLocaleString('ru-RU');

            return `
                <div class="operation-item accordion-item">
                    <div class="accordion-header" onclick="toggleAccordion('shipment-${op.id}')">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                                <span class="accordion-icon">▶</span>
                                <div>
                                    <h4 style="margin: 0;">
                                        📤 Отгрузка от ${shipmentDateStr}
                                        <span class="badge badge-danger">-${op.total_quantity} шт.</span>
                                    </h4>
                                    <div style="font-size: 13px; color: #6c757d; margin-top: 5px;">
                                        ${createdDateStr} | Товаров: ${op.items.length}
                                        ${op.note ? ` | ${op.note}` : ''}
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 5px;" onclick="event.stopPropagation()">
                                <button class="btn btn-primary btn-icon" onclick="editShipment(${op.id})" title="Редактировать">✏️</button>
                                <button class="btn btn-danger btn-icon" onclick="deleteShipment(${op.id})" title="Удалить">🗑️</button>
                            </div>
                        </div>
                    </div>

                    <div class="accordion-content" id="shipment-${op.id}">
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
                                        <td style="padding: 8px; text-align: right; color: #dc3545; font-weight: bold;">-${item.quantity}</td>
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
                <h4>${op.productName} <span class="badge badge-danger">-${op.quantity}</span></h4>
                <div class="details">
                    ${new Date(op.date).toLocaleString('ru-RU')}<br>
                    ${op.note ? `Примечание: ${op.note}` : ''}
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('shipmentHistory').innerHTML = shipmentOps.length ? '<h3>История отгрузок</h3>' + html : '';
}

export async function deleteShipment(operationId) {
    const operation = operations.find(op => op.id === operationId);
    if (!operation) return;

    const itemsInfo = operation.items
        ? `Товаров: ${operation.items.length}, общее количество: ${operation.total_quantity || operation.totalQuantity || 0}`
        : `${operation.productName}: ${operation.quantity} шт.`;

    if (!confirm(`Удалить отгрузку?\n${itemsInfo}\n\nТовары будут возвращены на склад.`)) {
        return;
    }

    try {
        await apiCall(`/api/operations/${operationId}`, 'DELETE');
        await loadData();
        await renderProducts();
        renderShipmentHistory();
        if (updateReportsFn) updateReportsFn();
        showAlert('Отгрузка удалена, товары возвращены на склад', 'success');
    } catch (error) {
        console.error('Error deleting shipment:', error);
        showAlert('Ошибка удаления: ' + error.message, 'error');
    }
}
