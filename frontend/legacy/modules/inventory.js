import { apiCall } from './api.js';
import { products, productFieldsSettings, operations, loadData } from './state.js';
import { renderProducts, showAlert } from './products.js';

let updateReportsFn = null;
export function setUpdateReports(fn) { updateReportsFn = fn; }

let inventoryData = {
    boxes: [],
    currentBox: {},
    boxCounter: 0,
    showCompletedBoxes: false
};

export function getInventoryData() { return inventoryData; }

export function startInventory() {
    inventoryData = {
        boxes: [],
        currentBox: {},
        boxCounter: 0,
        showCompletedBoxes: false
    };

    document.getElementById('inventoryModal').classList.add('active');
    document.getElementById('scanInput').focus();
    updateInventoryUI();

    const scanInput = document.getElementById('scanInput');
    scanInput.value = '';

    const newScanInput = scanInput.cloneNode(true);
    scanInput.parentNode.replaceChild(newScanInput, scanInput);

    newScanInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            processScan();
        }
    });

    document.getElementById('inventoryModal').addEventListener('click', function(e) {
        if (e.target === this || e.target.closest('.modal-content')) {
            newScanInput.focus();
        }
    });
}

export function processScan() {
    const scanInput = document.getElementById('scanInput');
    const barcode = scanInput.value.trim();

    if (!barcode) return;

    const product = products.find(p => {
        if (!p.custom_fields) return false;
        return p.custom_fields.some(field => {
            const fieldSetting = productFieldsSettings.find(fs => fs.name === field.name);
            return fieldSetting?.type === 'barcode' && field.value === barcode;
        });
    });

    if (product) {
        if (!inventoryData.currentBox[product.id]) {
            inventoryData.currentBox[product.id] = {
                product: product,
                count: 0
            };
        }
        inventoryData.currentBox[product.id].count++;

        showScanAlert(`✅ ${product.name} (+1)`, 'success');
        updateInventoryUI();

        const countElement = document.querySelector(`[data-product-id="${product.id}"] .scanned-item-count`);
        if (countElement) {
            countElement.classList.add('pulse');
            setTimeout(() => countElement.classList.remove('pulse'), 300);
        }
    } else {
        showScanAlert(`❌ Товар с штрихкодом "${barcode}" не найден`, 'error');
    }

    scanInput.value = '';
    scanInput.focus();
}

export function completeCurrentBox() {
    if (Object.keys(inventoryData.currentBox).length === 0) {
        alert('Короб пуст! Отсканируйте хотя бы один товар.');
        return;
    }

    inventoryData.boxCounter++;

    inventoryData.boxes.push({
        boxNumber: inventoryData.boxCounter,
        items: { ...inventoryData.currentBox },
        timestamp: new Date().toISOString()
    });

    inventoryData.currentBox = {};

    showScanAlert(`✅ Короб #${inventoryData.boxCounter} готов! Можно начинать следующий.`, 'success');
    updateInventoryUI();
    document.getElementById('scanInput').focus();
}

function updateInventoryUI() {
    const currentBoxHtml = Object.values(inventoryData.currentBox).map(item => `
        <div class="scanned-item" data-product-id="${item.product.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 6px; margin-bottom: 8px; border: 2px solid #667eea;">
            <div>
                <strong style="font-size: 15px;">${item.product.name}</strong>
                <div style="font-size: 13px; color: #6c757d;">SKU: ${item.product.sku}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="btn btn-secondary btn-icon" onclick="decrementInventoryItem(${item.product.id})" title="Уменьшить количество" style="width: 32px; height: 32px; padding: 0; font-size: 20px; line-height: 1;">−</button>
                    <span class="scanned-item-count" style="display: inline-flex; align-items: center; justify-content: center; min-width: 50px; height: 50px; border-radius: 50%; background: #667eea; color: white; font-size: 20px; font-weight: bold;">${item.count}</span>
                    <button class="btn btn-secondary btn-icon" onclick="incrementInventoryItem(${item.product.id})" title="Увеличить количество" style="width: 32px; height: 32px; padding: 0; font-size: 20px; line-height: 1;">+</button>
                </div>
                <button class="btn btn-danger btn-icon" onclick="removeScannedItem(${item.product.id})" title="Удалить">✕</button>
            </div>
        </div>
    `).join('');

    const currentBoxCount = Object.values(inventoryData.currentBox).reduce((sum, item) => sum + item.count, 0);

    if (!inventoryData.showCompletedBoxes) {
        document.getElementById('scannedItems').innerHTML = `
            <div style="background: #e8f4f8; padding: 15px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #667eea;">
                <h4 style="margin: 0 0 10px 0; color: #667eea;">📦 Текущий короб (в работе)</h4>
                <div style="font-size: 14px; color: #6c757d; margin-bottom: 10px;">
                    Товаров: ${Object.keys(inventoryData.currentBox).length} |
                    Всего штук: ${currentBoxCount}
                </div>
                ${currentBoxHtml || '<p style="color: #6c757d; text-align: center;">Короб пуст. Начните сканировать товары.</p>'}
                ${Object.keys(inventoryData.currentBox).length > 0 ? `
                    <button class="btn btn-success" onclick="completeCurrentBox()" style="width: 100%; margin-top: 10px;">
                        ✅ Короб готов - начать новый
                    </button>
                ` : ''}
            </div>
            <button class="btn btn-secondary" onclick="toggleCompletedBoxes()" style="width: 100%;">
                📋 Готовые коробы (${inventoryData.boxes.length})
            </button>
        `;
    } else {
        const boxesHtml = inventoryData.boxes.slice().reverse().map(box => {
            const boxItems = Object.values(box.items);
            const totalCount = boxItems.reduce((sum, item) => sum + item.count, 0);

            return `
                <div class="inventory-box-item">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4 style="margin: 0; color: #28a745;">✅ Короб #${box.boxNumber}</h4>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn-secondary btn-icon" onclick="downloadBoxLabel(${box.boxNumber})" title="Скачать этикетку">🏷️</button>
                            <button class="btn btn-danger btn-icon" onclick="removeBox(${box.boxNumber})" title="Удалить короб">🗑️</button>
                        </div>
                    </div>
                    <div style="font-size: 13px; margin-bottom: 10px;">
                        Позиций: ${boxItems.length} | Всего штук: ${totalCount}
                    </div>
                    <div style="max-height: 150px; overflow-y: auto;">
                        ${boxItems.map(item => `
                            <div class="inventory-box-item-row">
                                <span style="font-size: 13px;">${item.product.name}</span>
                                <span style="font-weight: bold; color: #28a745;">${item.count} шт.</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('scannedItems').innerHTML = `
            <button class="btn btn-secondary" onclick="toggleCompletedBoxes()" style="width: 100%; margin-bottom: 15px;">
                ← Назад к текущему коробу
            </button>
            <div style="margin-top: 20px;">
                <h4 style="margin-bottom: 15px;">📋 Готовые коробы (${inventoryData.boxes.length})</h4>
                ${boxesHtml}
            </div>
        `;
    }

    const totalBoxes = inventoryData.boxes.length;
    const totalScanned = inventoryData.boxes.reduce((sum, box) => {
        return sum + Object.values(box.items).reduce((s, item) => s + item.count, 0);
    }, 0) + currentBoxCount;

    document.getElementById('scannedCount').textContent =
        `${totalBoxes} коробов, ${totalScanned} шт. (+ текущий короб: ${currentBoxCount} шт.)`;
}

export function removeScannedItem(productId) {
    if (inventoryData.currentBox[productId]) {
        delete inventoryData.currentBox[productId];
        updateInventoryUI();
    }
}

export function incrementInventoryItem(productId) {
    if (inventoryData.currentBox[productId]) {
        inventoryData.currentBox[productId].count++;
        updateInventoryUI();

        const item = document.querySelector(`.scanned-item[data-product-id="${productId}"] .scanned-item-count`);
        if (item) {
            item.style.animation = 'pulse 0.3s ease-in-out';
            setTimeout(() => item.style.animation = '', 300);
        }
    }
}

export function decrementInventoryItem(productId) {
    if (inventoryData.currentBox[productId]) {
        if (inventoryData.currentBox[productId].count > 1) {
            inventoryData.currentBox[productId].count--;
            updateInventoryUI();

            const item = document.querySelector(`.scanned-item[data-product-id="${productId}"] .scanned-item-count`);
            if (item) {
                item.style.animation = 'pulse 0.3s ease-in-out';
                setTimeout(() => item.style.animation = '', 300);
            }
        } else {
            if (confirm('Удалить товар из короба?')) {
                removeScannedItem(productId);
            }
        }
    }
}

export function removeBox(boxNumber) {
    if (!confirm(`Удалить короб #${boxNumber}?`)) return;

    inventoryData.boxes = inventoryData.boxes.filter(box => box.boxNumber !== boxNumber);
    updateInventoryUI();
    showScanAlert(`Короб #${boxNumber} удален`, 'success');
}

function showScanAlert(message, type) {
    const alertDiv = document.getElementById('scanAlert');
    alertDiv.innerHTML = `<div class="scan-${type}">${message}</div>`;
    setTimeout(() => { alertDiv.innerHTML = ''; }, 2000);
}

export function cancelInventory() {
    if (inventoryData.boxes.length > 0 || Object.keys(inventoryData.currentBox).length > 0) {
        if (!confirm('Отменить инвентаризацию? Все отсканированные данные будут потеряны.')) {
            return;
        }
    }

    document.getElementById('inventoryModal').classList.remove('active');
    inventoryData = { boxes: [], currentBox: {}, boxCounter: 0, showCompletedBoxes: false };
}

export async function completeInventory() {
    if (inventoryData.boxes.length === 0) {
        alert('Нет готовых коробов! Завершите хотя бы один короб перед завершением инвентаризации.');
        return;
    }

    if (Object.keys(inventoryData.currentBox).length > 0) {
        if (!confirm('У вас есть незавершенный короб. Завершить его автоматически и продолжить?')) {
            return;
        }
        completeCurrentBox();
    }

    document.getElementById('inventoryModal').classList.remove('active');
    showInventoryResults();
}

export function showInventoryResults() {
    const totalItems = {};

    inventoryData.boxes.forEach(box => {
        Object.values(box.items).forEach(item => {
            if (!totalItems[item.product.id]) {
                totalItems[item.product.id] = {
                    product: item.product,
                    actualCount: 0
                };
            }
            totalItems[item.product.id].actualCount += parseInt(item.count) || 0;
        });
    });

    const differences = [];
    const noChanges = [];

    Object.values(totalItems).forEach(item => {
        const expected = parseInt(item.product.quantity) || 0;
        const actual = parseInt(item.actualCount) || 0;
        const diff = actual - expected;

        if (diff !== 0) {
            differences.push({
                productId: item.product.id,
                productName: item.product.name,
                sku: item.product.sku,
                expected, actual, diff
            });
        } else {
            noChanges.push({
                productName: item.product.name,
                sku: item.product.sku,
                quantity: actual
            });
        }
    });

    const modalHTML = `
        <div id="inventoryResultsModal" class="modal active">
            <div class="modal-content" style="max-width: 1000px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;">
                <h2>📊 Результаты инвентаризации</h2>

                <div class="inventory-results-stats">
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                        <div style="text-align: center;">
                            <div style="font-size: 13px;">Всего коробов</div>
                            <div style="font-size: 24px; font-weight: bold; color: #667eea;">${inventoryData.boxes.length}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 13px;">Позиций проверено</div>
                            <div style="font-size: 24px; font-weight: bold; color: #667eea;">${Object.keys(totalItems).length}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 13px;">Расхождений</div>
                            <div style="font-size: 24px; font-weight: bold; color: ${differences.length > 0 ? '#dc3545' : '#28a745'};">${differences.length}</div>
                        </div>
                    </div>
                </div>

                <div class="tabs-divider" style="display: flex; gap: 10px;">
                    <button class="result-tab active" onclick="switchResultTab('boxes')" data-tab="boxes">
                        📦 Коробы (${inventoryData.boxes.length})
                    </button>
                    <button class="result-tab" onclick="switchResultTab('differences')" data-tab="differences">
                        ⚠️ Расхождения (${differences.length})
                    </button>
                    <button class="result-tab" onclick="switchResultTab('nochanges')" data-tab="nochanges">
                        ✅ Без изменений (${noChanges.length})
                    </button>
                </div>

                <div style="flex: 1; overflow-y: auto; margin-bottom: 20px;">
                    <div id="result-tab-boxes" class="result-tab-content active">
                        ${inventoryData.boxes.map(box => {
                            const boxItems = Object.values(box.items);
                            const totalCount = boxItems.reduce((sum, item) => sum + item.count, 0);
                            return `
                                <div class="inventory-result-box">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                        <h4 style="margin: 0; color: #667eea;">Короб #${box.boxNumber}</h4>
                                        <button class="btn btn-secondary" onclick="downloadBoxLabel(${box.boxNumber})" style="padding: 8px 15px; font-size: 13px;">
                                            🏷️ Скачать этикетку
                                        </button>
                                    </div>
                                    <div style="font-size: 13px; margin-bottom: 10px;">
                                        Позиций: ${boxItems.length} | Всего штук: ${totalCount}
                                    </div>
                                    <table class="inventory-result-table">
                                        <thead>
                                            <tr>
                                                <th style="text-align: left;">Товар</th>
                                                <th style="text-align: left;">SKU</th>
                                                <th style="text-align: right;">Количество</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${boxItems.map(item => `
                                                <tr>
                                                    <td>${item.product.name}</td>
                                                    <td><code>${item.product.sku}</code></td>
                                                    <td style="text-align: right; font-weight: bold;">${item.count}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div id="result-tab-differences" class="result-tab-content">
                        ${differences.length > 0 ? `
                            <table class="inventory-result-table">
                                <thead>
                                    <tr>
                                        <th style="text-align: left;">Товар</th>
                                        <th style="text-align: left;">SKU</th>
                                        <th style="text-align: right;">Было в системе</th>
                                        <th style="text-align: right;">Фактически</th>
                                        <th style="text-align: right;">Разница</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${differences.map(diff => `
                                        <tr>
                                            <td>${diff.productName}</td>
                                            <td><code>${diff.sku}</code></td>
                                            <td style="text-align: right;">${diff.expected}</td>
                                            <td style="text-align: right; font-weight: bold;">${diff.actual}</td>
                                            <td style="text-align: right; font-weight: bold; color: ${diff.diff > 0 ? '#28a745' : '#dc3545'};">
                                                ${diff.diff > 0 ? '+' : ''}${diff.diff}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <div style="text-align: center; padding: 40px; color: #28a745;">
                                <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
                                <h3>Расхождений не обнаружено!</h3>
                                <p>Все товары совпадают с данными в системе.</p>
                            </div>
                        `}
                    </div>

                    <div id="result-tab-nochanges" class="result-tab-content">
                        ${noChanges.length > 0 ? `
                            <table class="inventory-result-table">
                                <thead>
                                    <tr>
                                        <th style="text-align: left;">Товар</th>
                                        <th style="text-align: left;">SKU</th>
                                        <th style="text-align: right;">Количество</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${noChanges.map(item => `
                                        <tr>
                                            <td>${item.productName}</td>
                                            <td><code>${item.sku}</code></td>
                                            <td style="text-align: right; font-weight: bold; color: #28a745;">${item.quantity} ✓</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <div style="text-align: center; padding: 40px; color: #6c757d;">
                                <p>Нет товаров без изменений</p>
                            </div>
                        `}
                    </div>
                </div>

                <div style="display: flex; gap: 10px; border-top: 2px solid #e9ecef; padding-top: 20px;">
                    <button class="btn btn-primary" onclick="backToInventory()" style="flex: 1; font-size: 16px; padding: 15px;">
                        ⬅️ Назад к инвентаризации
                    </button>
                    <button class="btn btn-success" onclick="applyInventoryResults()" style="flex: 1; font-size: 16px; padding: 15px;">
                        ✅ Применить изменения
                    </button>
                    <button class="btn btn-secondary" onclick="cancelInventoryResults()" style="flex: 1; font-size: 16px; padding: 15px;">
                        ❌ Отменить всё
                    </button>
                </div>
            </div>
        </div>

        <style>
            .result-tab {
                padding: 12px 20px;
                background: transparent;
                border: none;
                border-bottom: 3px solid transparent;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                color: #6c757d;
                transition: all 0.2s;
            }
            .result-tab:hover { color: #667eea; }
            .result-tab.active {
                color: #667eea;
                border-bottom-color: #667eea;
            }
            .result-tab-content { display: none; }
            .result-tab-content.active { display: block; }
        </style>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = modalHTML;
    document.body.appendChild(tempDiv.firstElementChild);

    window.inventoryResultsData = { totalItems, differences };
}

export function switchResultTab(tabName) {
    document.querySelectorAll('.result-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.result-tab[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.result-tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`result-tab-${tabName}`).classList.add('active');
}

export async function applyInventoryResults() {
    if (!confirm('Применить результаты инвентаризации? Остатки товаров будут обновлены.')) {
        return;
    }

    try {
        const { totalItems, differences } = window.inventoryResultsData;

        await apiCall('/api/operations', 'POST', {
            type: 'inventory',
            operation_date: new Date().toISOString().split('T')[0],
            note: `Инвентаризация: ${inventoryData.boxes.length} коробов, ${Object.keys(totalItems).length} позиций`,
            differences: differences,
            items: Object.values(totalItems).map(item => ({
                productId: item.product.id,
                productName: item.product.name,
                productSKU: item.product.sku,
                expected: item.product.quantity,
                actual: item.actualCount
            }))
        });

        document.getElementById('inventoryResultsModal').remove();
        inventoryData = { boxes: [], currentBox: {}, boxCounter: 0, showCompletedBoxes: false };
        delete window.inventoryResultsData;

        await loadData();
        await renderProducts();
        renderInventoryHistory();
        if (updateReportsFn) updateReportsFn();

        showAlert('✅ Инвентаризация завершена! Остатки обновлены.', 'success');
    } catch (error) {
        console.error('Error applying inventory:', error);
        alert('Ошибка применения инвентаризации: ' + error.message);
    }
}

export function cancelInventoryResults() {
    if (!confirm('Отменить инвентаризацию? Все данные будут потеряны.')) {
        return;
    }

    document.getElementById('inventoryResultsModal').remove();
    inventoryData = { boxes: [], currentBox: {}, boxCounter: 0, showCompletedBoxes: false };
    delete window.inventoryResultsData;

    showAlert('Инвентаризация отменена', 'info');
}

export function backToInventory() {
    document.getElementById('inventoryResultsModal').remove();
    delete window.inventoryResultsData;

    document.getElementById('inventoryModal').classList.add('active');
    updateInventoryUI();

    setTimeout(() => {
        document.getElementById('scanInput').focus();
    }, 100);

    showScanAlert('Вы вернулись к инвентаризации. Можете продолжить сканирование.', 'success');
}

export function renderInventoryHistory() {
    const inventoryOps = operations.filter(op => op.type === 'inventory').slice(-10).reverse();
    const html = inventoryOps.map(op => {
        const diffsCount = op.differences ? op.differences.length : 0;

        return `
            <div class="operation-item">
                <h4>Инвентаризация
                    <span class="badge badge-warning">${diffsCount} расхождений</span>
                </h4>
                <div class="details">
                    ${new Date(op.created_at || op.date).toLocaleString('ru-RU')}<br>
                    ${op.note ? `Примечание: ${op.note}<br>` : ''}
                    ${diffsCount > 0 ? `
                        <details style="margin-top: 10px;">
                            <summary style="cursor: pointer; color: #667eea;">Показать расхождения</summary>
                            <div style="margin-top: 10px;">
                                ${op.differences.map(diff => `
                                    <div style="padding: 5px; border-bottom: 1px solid #e9ecef;">
                                        ${diff.productName}:
                                        <span style="color: #dc3545;">${diff.expected}</span> →
                                        <span style="color: #28a745;">${diff.actual}</span>
                                        (${diff.diff > 0 ? '+' : ''}${diff.diff})
                                    </div>
                                `).join('')}
                            </div>
                        </details>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('inventoryHistory').innerHTML =
        inventoryOps.length ? '<h3>История инвентаризаций</h3>' + html : '';
}

export function toggleCompletedBoxes() {
    inventoryData.showCompletedBoxes = !inventoryData.showCompletedBoxes;
    updateInventoryUI();

    if (!inventoryData.showCompletedBoxes) {
        document.getElementById('scanInput').focus();
    }
}
