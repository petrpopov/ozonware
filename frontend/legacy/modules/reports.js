import { apiCall } from './api.js';
import { operations } from './state.js';

export async function updateReports() {
    try {
        const stats = await apiCall('/api/stats');

        document.getElementById('statsCards').innerHTML = `
            <div class="stat-card">
                <h3>Всего товаров</h3>
                <div class="value">${stats.totalProducts || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Общее количество</h3>
                <div class="value">${stats.totalQuantity || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Операций прихода</h3>
                <div class="value">${stats.totalReceipts || 0}</div>
            </div>
            <div class="stat-card">
                <h3>Операций отгрузки</h3>
                <div class="value">${stats.totalShipments || 0}</div>
            </div>
        `;

        const recentOps = operations.slice(-20).reverse();
        const html = recentOps.map(op => {
            let badge = '';
            let text = '';

            if (op.type === 'receipt') {
                if (op.items) {
                    const dateStr = op.receiptDate ? new Date(op.receiptDate).toLocaleDateString('ru-RU') : '';
                    badge = `<span class="badge badge-success">Приход +${op.total_quantity}</span>`;
                    text = `${dateStr ? dateStr + ' - ' : ''}Товаров: ${op.items.length}`;
                } else {
                    badge = `<span class="badge badge-success">Приход +${op.quantity}</span>`;
                    text = op.productName;
                }
            } else if (op.type === 'shipment') {
                if (op.items) {
                    const dateStr = op.shipmentDate ? new Date(op.shipmentDate).toLocaleDateString('ru-RU') : '';
                    badge = `<span class="badge badge-danger">Отгрузка -${op.total_quantity}</span>`;
                    text = `${dateStr ? dateStr + ' - ' : ''}Товаров: ${op.items.length}`;
                } else {
                    badge = `<span class="badge badge-danger">Отгрузка -${op.quantity}</span>`;
                    text = op.productName;
                }
            } else if (op.type === 'inventory') {
                badge = `<span class="badge badge-warning">Инвентаризация</span>`;
                text = `Проверено ${op.differences.length} позиций`;
            }

            return `
                <div class="operation-item">
                    <h4>${text} ${badge}</h4>
                    <div class="details">
                        ${new Date(op.created_at || op.date).toLocaleString('ru-RU')}
                        ${op.note ? `<br>Примечание: ${op.note}` : ''}
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('operationsHistory').innerHTML = html || '<p>Операций пока нет</p>';
    } catch (error) {
        console.error('Error updating reports:', error);
    }
}
