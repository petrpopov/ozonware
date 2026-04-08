import { apiCall } from './api.js';
import { products, productFieldsSettings, loadData } from './state.js';
import { renderProducts, showAlert } from './products.js';

window.importData = {
    file: null,
    rawData: [],
    headers: [],
    mapping: {},
    preview: [],
    skipFirstRow: true
};

export function showImportModal() {
    document.getElementById('importModal').classList.add('active');
    document.getElementById('importStep1').style.display = 'block';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importNextBtn').style.display = 'none';
    document.getElementById('importExecuteBtn').style.display = 'none';

    window.importData = {
        file: null,
        rawData: [],
        headers: [],
        mapping: {},
        preview: [],
        skipFirstRow: true
    };

    document.getElementById('fileInfo').style.display = 'none';

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('excelFileInput');

    dropZone.onclick = () => fileInput.click();

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#667eea';
        dropZone.style.background = '#e8f4f8';
    };

    dropZone.ondragleave = () => {
        dropZone.style.borderColor = '#667eea';
        dropZone.style.background = '#f8f9fa';
    };

    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#667eea';
        dropZone.style.background = '#f8f9fa';
        handleImportFile(e.dataTransfer.files[0]);
    };

    fileInput.onchange = (e) => {
        handleImportFile(e.target.files[0]);
    };
}

export function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
}

function handleImportFile(file) {
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
        alert('Пожалуйста, выберите файл Excel (.xlsx или .xls)');
        return;
    }

    window.importData.file = file;

    document.getElementById('fileInfo').innerHTML = `
        <div style="background: #d4edda; padding: 15px; border-radius: 6px; border-left: 4px solid #28a745;">
            <strong>✅ Файл загружен:</strong> ${file.name} (${(file.size / 1024).toFixed(2)} KB)
        </div>
    `;
    document.getElementById('fileInfo').style.display = 'block';
    document.getElementById('importNextBtn').style.display = 'inline-block';
}

export async function processImportFile() {
    try {
        showAlert('Обработка файла...', 'info');

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                if (jsonData.length === 0) {
                    alert('Файл пуст!');
                    return;
                }

                window.importData.rawData = jsonData;
                window.importData.headers = jsonData[0] || [];

                autoMapFields();

                document.getElementById('importStep1').style.display = 'none';
                document.getElementById('importStep2').style.display = 'block';
                document.getElementById('importNextBtn').style.display = 'none';
                document.getElementById('importExecuteBtn').style.display = 'inline-block';

                renderMapping();
                updatePreview();

                showAlert('', 'info');
            } catch (error) {
                console.error('Error processing Excel:', error);
                alert('Ошибка обработки файла: ' + error.message);
            }
        };

        reader.readAsArrayBuffer(window.importData.file);
    } catch (error) {
        console.error('Error:', error);
        alert('Ошибка: ' + error.message);
    }
}

function autoMapFields() {
    const productFields = [
        { key: 'name', label: 'Название', required: true },
        { key: 'sku', label: 'SKU', required: true },
        { key: 'quantity', label: 'Количество', required: false },
        { key: 'description', label: 'Описание', required: false }
    ];

    productFieldsSettings.forEach(field => {
        productFields.push({
            key: `custom_${field.name}`,
            label: field.name,
            required: field.required || false,
            isCustom: true
        });
    });

    window.importData.mapping = {};

    window.importData.headers.forEach((header, index) => {
        const headerLower = String(header).toLowerCase().trim();

        for (const field of productFields) {
            const fieldLower = field.label.toLowerCase();
            const keyLower = field.key.toLowerCase();

            if (headerLower === fieldLower ||
                headerLower === keyLower ||
                headerLower.includes(fieldLower) ||
                fieldLower.includes(headerLower)) {
                window.importData.mapping[index] = field.key;
                break;
            }
        }

        if (!window.importData.mapping[index]) {
            window.importData.mapping[index] = null;
        }
    });
}

function renderMapping() {
    const productFields = [
        { key: null, label: '-- Не импортировать --' },
        { key: 'name', label: 'Название *', required: true },
        { key: 'sku', label: 'SKU *', required: true },
        { key: 'quantity', label: 'Количество' },
        { key: 'description', label: 'Описание' }
    ];

    productFieldsSettings.forEach(field => {
        productFields.push({
            key: `custom_${field.name}`,
            label: field.name + (field.required ? ' *' : ''),
            isCustom: true
        });
    });

    const html = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: white;">
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Колонка из Excel</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Пример данных</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Соответствует полю</th>
                </tr>
            </thead>
            <tbody>
                ${window.importData.headers.map((header, index) => {
                    const exampleData = window.importData.rawData[1] ? window.importData.rawData[1][index] : '';
                    return `
                        <tr style="border-bottom: 1px solid #e9ecef;">
                            <td style="padding: 10px;">
                                <strong>${header || `Колонка ${index + 1}`}</strong>
                            </td>
                            <td style="padding: 10px; color: #6c757d; font-size: 13px;">
                                ${exampleData || '—'}
                            </td>
                            <td style="padding: 10px;">
                                <select onchange="importData.mapping[${index}] = this.value === 'null' ? null : this.value; updatePreview();"
                                        style="width: 100%; padding: 8px;">
                                    ${productFields.map(field => `
                                        <option value="${field.key}" ${window.importData.mapping[index] === field.key ? 'selected' : ''}>
                                            ${field.label}
                                        </option>
                                    `).join('')}
                                </select>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('mappingContainer').innerHTML = html;
}

export function updatePreview() {
    const skipFirst = document.getElementById('skipFirstRow').checked;
    window.importData.skipFirstRow = skipFirst;

    const startRow = skipFirst ? 1 : 0;
    const previewRows = window.importData.rawData.slice(startRow, startRow + 5);

    const fieldsToShow = ['name', 'sku', 'quantity', 'description'];
    productFieldsSettings.forEach(f => fieldsToShow.push(`custom_${f.name}`));

    const existingSKUs = products.map(p => p.sku.toLowerCase().trim());

    let duplicateCount = 0;

    const previewData = previewRows.map(row => {
        const item = {};

        Object.keys(window.importData.mapping).forEach(colIndex => {
            const fieldKey = window.importData.mapping[colIndex];
            if (fieldKey) {
                item[fieldKey] = row[colIndex] || '';
            }
        });

        if (item.sku) {
            const skuNormalized = String(item.sku).toLowerCase().trim();
            if (existingSKUs.includes(skuNormalized)) {
                item._isDuplicate = true;
                duplicateCount++;
            }
        }

        return item;
    });

    window.importData.preview = previewData;

    const html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; background: white;">
            <thead>
                <tr style="background: #f8f9fa;">
                    ${fieldsToShow.map(field => {
                        let label = field;
                        if (field === 'name') label = 'Название';
                        else if (field === 'sku') label = 'SKU';
                        else if (field === 'quantity') label = 'Количество';
                        else if (field === 'description') label = 'Описание';
                        else if (field.startsWith('custom_')) label = field.replace('custom_', '');
                        return `<th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">${label}</th>`;
                    }).join('')}
                    <th style="padding: 8px; text-align: center; border-bottom: 2px solid #dee2e6;">Статус</th>
                </tr>
            </thead>
            <tbody>
                ${previewData.map(item => `
                    <tr style="border-bottom: 1px solid #e9ecef; ${item._isDuplicate ? 'background: #fff3cd;' : ''}">
                        ${fieldsToShow.map(field => {
                            const value = item[field] || '—';
                            return `<td style="padding: 8px;">${value}</td>`;
                        }).join('')}
                        <td style="padding: 8px; text-align: center;">
                            ${item._isDuplicate ?
                                '<span style="color: #856404;">⚠️ Дубликат</span>' :
                                '<span style="color: #28a745;">✅ Новый</span>'}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('previewContainer').innerHTML = html;

    const totalRows = window.importData.rawData.length - (skipFirst ? 1 : 0);
    document.getElementById('importSummary').innerHTML = `
        <strong>Итого:</strong><br>
        📊 Всего строк в файле: ${totalRows}<br>
        ✅ Новых товаров для импорта: ${totalRows - duplicateCount}<br>
        ⚠️ Дубликатов (будут пропущены): ${duplicateCount}
    `;
}

export async function executeImport() {
    try {
        const skipFirst = window.importData.skipFirstRow;
        const startRow = skipFirst ? 1 : 0;
        const rowsToImport = window.importData.rawData.slice(startRow);

        const existingSKUs = products.map(p => p.sku.toLowerCase().trim());

        const newProducts = [];
        let skippedCount = 0;

        for (const row of rowsToImport) {
            const product = {};

            Object.keys(window.importData.mapping).forEach(colIndex => {
                const fieldKey = window.importData.mapping[colIndex];
                if (fieldKey && row[colIndex] !== undefined && row[colIndex] !== '') {
                    if (fieldKey.startsWith('custom_')) {
                        if (!product.custom_fields) product.custom_fields = [];
                        const fieldName = fieldKey.replace('custom_', '');
                        product.custom_fields.push({
                            name: fieldName,
                            value: String(row[colIndex])
                        });
                    } else {
                        product[fieldKey] = row[colIndex];
                    }
                }
            });

            if (!product.name || !product.sku) continue;

            const skuNormalized = String(product.sku).toLowerCase().trim();
            if (existingSKUs.includes(skuNormalized)) {
                skippedCount++;
                continue;
            }

            product.quantity = parseInt(product.quantity) || 0;
            product.description = product.description || '';
            product.custom_fields = product.custom_fields || [];

            newProducts.push(product);
            existingSKUs.push(skuNormalized);
        }

        if (newProducts.length === 0) {
            alert('Нет новых товаров для импорта!');
            return;
        }

        if (!confirm(`Импортировать ${newProducts.length} товаров?\n(${skippedCount} дубликатов будет пропущено)`)) {
            return;
        }

        showAlert('Импорт товаров...', 'info');

        for (const product of newProducts) {
            await apiCall('/api/products', 'POST', product);
        }

        await loadData();
        await renderProducts();

        closeImportModal();
        showAlert(`✅ Импортировано ${newProducts.length} товаров! (Пропущено дубликатов: ${skippedCount})`, 'success');

    } catch (error) {
        console.error('Import error:', error);
        alert('Ошибка импорта: ' + error.message);
    }
}
