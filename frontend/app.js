// Хранилище данных
let products = [];
let operations = [];
let customFieldsTemplate = [];
let barcodesTemplate = [];
let productFieldsSettings = []; // Единые настройки полей для всех товаров

// ==================== API CONFIGURATION ====================
const API_URL = '/api';


// Работа с localStorage
async function loadData() {
    // products = JSON.parse(localStorage.getItem('warehouse_products') || '[]');
    products = await fetch('/api/products').then(r => r.json());
    // operations = JSON.parse(localStorage.getItem('warehouse_operations') || '[]');
    operations = await fetch('/api/operations').then(r => r.json());

    // Дефолтные поля при первом запуске
    const defaultFields = [
        { name: 'Штрихкод', type: 'barcode', required: false, showInTable: true }
    ];
    // productFieldsSettings = JSON.parse(localStorage.getItem('warehouse_product_fields') || JSON.stringify(defaultFields));
    productFieldsSettings = await fetch('/api/product-fields').then(r => r.json());

    // Добавляем showInTable к старым полям если его нет
    productFieldsSettings = productFieldsSettings.map(field => ({
        ...field,
        showInTable: field.showInTable !== undefined ? field.showInTable : true
    }));

    // Загружаем порядок колонок
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

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, options);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        if (method === 'DELETE') {
            return { success: true };
        }

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

let columnsOrder = []; // Порядок колонок в таблице

// Получить порядок колонок по умолчанию
function getDefaultColumnsOrder() {
    return ['#', 'name', 'sku', ...productFieldsSettings.map(f => f.name), 'quantity', 'actions'];
}

// Инициализация
async function init() {
    try {
        await loadData();
        await loadWriteoffs(); // Загрузка списаний
        await renderProducts();
        updateReports();
        initSearchHandlers(); // Инициализация обработчиков поиска
        renderWriteoffHistory();
        renderWriteoffSummary();
    } catch (error) {
        console.error('Init error:', error);
        showAlert('Ошибка инициализации: ' + error.message, 'error');
    }
}

// Настройки полей товаров
function renderProductFieldsSettings() {
    const container = document.getElementById('productFieldsList');
    container.innerHTML = productFieldsSettings.map((field, index) => {
        // Инициализируем options если это список
        if (field.type === 'select' && !field.options) {
            field.options = [];
        }

        // Редактор значений списка
        let optionsEditor = '';
        if (field.type === 'select') {
            const optionsList = (field.options || []).map((opt, optIndex) => `
                        <div style="display: flex; gap: 5px; margin-bottom: 5px;">
                            <input type="text" value="${opt}" 
                                onchange="productFieldsSettings[${index}].options[${optIndex}] = this.value"
                                style="flex: 1; padding: 5px;">
                            <button class="btn btn-danger btn-icon" 
                                onclick="productFieldsSettings[${index}].options.splice(${optIndex}, 1); renderProductFieldsSettings()" 
                                title="Удалить">✕</button>
                        </div>
                    `).join('');

            optionsEditor = `
                        <div style="grid-column: 1 / -1; background: #f8f9fa; padding: 10px; border-radius: 6px; margin-top: 5px;">
                            <strong style="font-size: 13px;">Значения списка:</strong>
                            <div style="margin-top: 10px;">
                                ${optionsList}
                                <button class="btn btn-secondary" style="margin-top: 5px; padding: 5px 10px; font-size: 13px;"
                                    onclick="productFieldsSettings[${index}].options.push(''); renderProductFieldsSettings()">
                                    + Добавить значение
                                </button>
                            </div>
                        </div>
                    `;
        }

        return `
                    <div style="margin-bottom: 15px; display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr auto; gap: 10px; align-items: center;">
                        <input type="text" placeholder="Название поля" value="${field.name}" 
                            onchange="productFieldsSettings[${index}].name = this.value"
                            style="font-weight: 500; padding: 10px;">
                        <select onchange="productFieldsSettings[${index}].type = this.value; renderProductFieldsSettings()" style="padding: 10px;">
                            <option value="barcode" ${field.type === 'barcode' ? 'selected' : ''}>Штрихкод</option>
                            <option value="text" ${field.type === 'text' ? 'selected' : ''}>Текстовое</option>
                            <option value="number" ${field.type === 'number' ? 'selected' : ''}>Числовое</option>
                            <option value="image" ${field.type === 'image' ? 'selected' : ''}>Изображение</option>
                            <option value="select" ${field.type === 'select' ? 'selected' : ''}>Список</option>
                        </select>
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                            <input type="checkbox" ${field.required ? 'checked' : ''} 
                                onchange="productFieldsSettings[${index}].required = this.checked">
                            <span style="font-size: 13px;">Обязательное</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                            <input type="checkbox" ${field.showInTable !== false ? 'checked' : ''} 
                                onchange="productFieldsSettings[${index}].showInTable = this.checked">
                            <span style="font-size: 13px;">В таблице</span>
                        </label>
                        <button class="btn btn-danger btn-icon" onclick="removeProductFieldSetting(${index})" title="Удалить">🗑️</button>
                        ${optionsEditor}
                    </div>
                `;
    }).join('');
}

function addProductFieldSetting() {
    productFieldsSettings.push({ name: '', type: 'text', required: false, showInTable: true });
    renderProductFieldsSettings();
}

function removeProductFieldSetting(index) {
    if (productFieldsSettings.length <= 1) {
        alert('Должно быть хотя бы одно поле!');
        return;
    }
    productFieldsSettings.splice(index, 1);
    renderProductFieldsSettings();
}

async function saveProductFieldsSettings() {
    if (productFieldsSettings.length === 0) {
        alert('Добавьте хотя бы одно поле!');
        productFieldsSettings = [{ name: 'Штрихкод', type: 'barcode', required: false, showInTable: true }];
        renderProductFieldsSettings();
        return;
    }

    try {
        const currentFields = await apiCall('/product-fields');
        for (const field of currentFields) {
            await apiCall(`/product-fields/${field.id}`, 'DELETE');
        }

        for (let i = 0; i < productFieldsSettings.length; i++) {
            const field = productFieldsSettings[i];
            await apiCall('/product-fields', 'POST', {
                name: field.name,
                type: field.type,
                required: field.required || false,
                show_in_table: field.showInTable !== false,
                options: field.options || [],
                position: i
            });
        }

        await loadData();
        await renderProducts();
        showAlert('Настройки полей сохранены успешно!', 'success');
    } catch (error) {
        console.error('Error saving fields:', error);
        showAlert('Ошибка сохранения: ' + error.message, 'error');
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Находим нужный таб по имени
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((tab, index) => {
        if (tab.textContent.toLowerCase().includes(tabName.substring(0, 5))) {
            tab.classList.add('active');
        }
    });

    document.getElementById(tabName).classList.add('active');

    if (tabName === 'receipt') {
        renderReceiptHistory();
    } else if (tabName === 'shipment') {
        renderShipmentHistory();
    } else if (tabName === 'inventory') {
        renderInventoryHistory();
    } else if (tabName === 'reports') {
        updateReports();
    } else if (tabName === 'settings') {
        renderProductFieldsSettings();
    }
}

// Товары
function showAddProductModal() {
    document.getElementById('productModalTitle').textContent = 'Добавить товар';
    document.getElementById('productId').value = '';
    document.getElementById('productModal').classList.add('active');
    document.getElementById('productName').value = '';
    document.getElementById('productSKU').value = '';

    // Инициализируем штрихкоды согласно настройкам
    barcodesTemplate = productFieldsSettings.map(field => ({ type: field.name, value: '' }));

    document.getElementById('productQuantity').value = '0';
    document.getElementById('productDescription').value = '';
    customFieldsTemplate = productFieldsSettings.map(field => {
        let defaultValue = '';

        // Для обязательных списочных полей устанавливаем первое значение
        if (field.type === 'select' && field.required && field.options && field.options.length > 0) {
            defaultValue = field.options[0];
        }

        return {
            name: field.name,
            value: defaultValue,
            type: field.type,
            required: field.required
        };
    });
    renderCustomFields();
}

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    document.getElementById('productModalTitle').textContent = 'Редактировать товар';
    document.getElementById('productId').value = id;
    document.getElementById('productModal').classList.add('active');
    document.getElementById('productName').value = product.name;
    document.getElementById('productSKU').value = product.sku || '';

    // Загружаем штрихкоды согласно настройкам полей
    barcodesTemplate = productFieldsSettings.map((fieldSetting, index) => {
        // Ищем существующий штрихкод для этого поля
        let existingBarcode = null;
        if (product.barcodes && product.barcodes[index]) {
            existingBarcode = product.barcodes[index];
        } else if (index === 0 && product.barcode) {
            // Для старых товаров с одним штрихкодом
            existingBarcode = { type: fieldSetting.name, value: product.barcode };
        }

        return {
            type: fieldSetting.name,
            value: existingBarcode ? existingBarcode.value : ''
        };
    });

    document.getElementById('productQuantity').value = product.quantity;
    document.getElementById('productDescription').value = product.description || '';

    // Загружаем кастомные поля согласно текущим настройкам
    customFieldsTemplate = productFieldsSettings.map(fieldSetting => {
        const existingField = product.custom_fields?.find(f => f.name === fieldSetting.name);
        let value = existingField ? existingField.value : '';

        // Для обязательных списочных полей, если значение пустое - берем первое из списка
        if (!value && fieldSetting.type === 'select' && fieldSetting.required && fieldSetting.options && fieldSetting.options.length > 0) {
            value = fieldSetting.options[0];
        }

        return {
            name: fieldSetting.name,
            value: value,
            type: fieldSetting.type,
            required: fieldSetting.required
        };
    });
    renderCustomFields();
}

function closeModal() {
    document.getElementById('productModal').classList.remove('active');
}

function renderCustomFields() {
    const container = document.getElementById('customFieldsList');
    if (customFieldsTemplate.length === 0) {
        container.innerHTML = '<p style="color: #6c757d; text-align: center;">Нет дополнительных полей</p>';
        return;
    }

    container.innerHTML = customFieldsTemplate.map((field, index) => {
        const inputType = field.type === 'number' ? 'number' : 'text';
        const requiredMark = field.required ? '<span style="color: red;">*</span>' : '';

        let fieldHTML = '';

        // Для списков показываем select
        if (field.type === 'select') {
            const fieldSetting = productFieldsSettings.find(f => f.name === field.name);
            const options = fieldSetting?.options || [];

            fieldHTML = `
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label>${field.name} ${requiredMark}</label>
                            <select onchange="customFieldsTemplate[${index}].value = this.value" 
                                ${field.required ? 'required' : ''}>
                                <option value="">-- Выберите --</option>
                                ${options.map(opt => `
                                    <option value="${opt}" ${field.value === opt ? 'selected' : ''}>${opt}</option>
                                `).join('')}
                            </select>
                        </div>
                    `;
        }
        // Для изображений показываем превью
        else if (field.type === 'image') {
            fieldHTML = `
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label>${field.name} ${requiredMark}</label>
                            <input type="url" 
                                placeholder="URL изображения (https://...)" 
                                value="${field.value}" 
                                onchange="customFieldsTemplate[${index}].value = this.value; updateImagePreview(${index})"
                                ${field.required ? 'required' : ''}>
                            ${field.value ? `
                                <div id="preview-${index}" style="margin-top: 10px;">
                                    <img src="${field.value}" 
                                        style="max-width: 200px; max-height: 200px; border-radius: 6px; border: 2px solid #e9ecef;"
                                        onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                                    <div style="display: none; padding: 10px; background: #f8d7da; border-radius: 6px; color: #721c24;">
                                        ❌ Не удалось загрузить изображение
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `;
        }
        // Для остальных типов - обычные input
        else {
            fieldHTML = `
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label>${field.name} ${requiredMark}</label>
                            <input type="${inputType}" 
                                placeholder="${field.type === 'barcode' ? 'Штрихкод' : field.name}" 
                                value="${field.value}" 
                                onchange="customFieldsTemplate[${index}].value = this.value"
                                ${field.required ? 'required' : ''}>
                        </div>
                    `;
        }

        return fieldHTML;
    }).join('');
}

function updateImagePreview(index) {
    // Обновляем превью при изменении URL
    setTimeout(() => renderCustomFields(), 100);
}

async function saveProduct() {
    const productId = document.getElementById('productId').value;
    const name = document.getElementById('productName').value.trim();
    const sku = document.getElementById('productSKU').value.trim();
    const quantity = parseInt(document.getElementById('productQuantity').value) || 0;
    const description = document.getElementById('productDescription').value.trim();

    if (!name || !sku) {
        showModalAlert('Заполните обязательные поля: Название и SKU', 'error');
        return;
    }

    for (const field of customFieldsTemplate) {
        if (field.required && !field.value) {
            showModalAlert(`Поле "${field.name}" обязательно для заполнения`, 'error');
            return;
        }
    }

    const customFields = customFieldsTemplate.filter(f => f.value && f.value.trim() !== '');

    const productData = {
        name,
        sku,
        quantity,
        description,
        custom_fields: customFields
    };

    try {
        if (productId) {
            await apiCall(`/products/${productId}`, 'PUT', productData);
            showAlert('Товар обновлен успешно!', 'success');
        } else {
            await apiCall('/products', 'POST', productData);
            showAlert('Товар добавлен успешно!', 'success');
        }

        await loadData();
        await renderProducts();
        closeModal();
    } catch (error) {
        console.error('Error saving product:', error);
        showModalAlert('Ошибка сохранения: ' + error.message, 'error');
    }
}

// Global DataTable instance
let productsDataTable = null;

async function renderProducts() {
    // Видимые кастомные поля
    const visibleFields = productFieldsSettings.filter(field => field.showInTable !== false);
    
    // Уничтожаем старую таблицу если существует
    if (productsDataTable) {
        productsDataTable.destroy();
        productsDataTable = null;
    }
    
    // Подготавливаем колонки для DataTables
    const columns = [
        { 
            data: null, 
            title: 'ID', 
            render: (data, type, row) => row.id,
            width: '50px'
        },
        { 
            data: 'name', 
            title: 'Название',
            render: (data, type, row) => {
                if (type === 'display') {
                    return `<strong>${row.name}</strong><br><small>${row.description || ''}</small>`;
                }
                return row.name;
            }
        },
        { 
            data: 'sku', 
            title: 'SKU',
            render: (data, type, row) => {
                if (type === 'display') {
                    return `<code>${row.sku || '—'}</code>`;
                }
                return row.sku || '';
            }
        }
    ];
    
    // Добавляем кастомные поля
    visibleFields.forEach(fieldSetting => {
        columns.push({
            data: null,
            title: fieldSetting.name,
            render: (data, type, row) => {
                const field = row.custom_fields?.find(f => f.name === fieldSetting.name);
                
                if (type === 'display') {
                    if (fieldSetting.type === 'image' && field && field.value) {
                        return `<img src="${field.value}" alt="Фото" style="max-width: 40px; max-height: 40px; object-fit: cover; border-radius: 4px;" onerror="this.style.display='none'; this.parentElement.innerHTML='❌'">`;
                    }
                    return field ? field.value : '—';
                }
                
                return field ? field.value : '';
            }
        });
    });
    
    // Количество
    columns.push({ 
        data: 'quantity', 
        title: 'Количество',
        render: (data, type, row) => {
            if (type === 'display') {
                return `<strong>${row.quantity}</strong>`;
            }
            return row.quantity;
        }
    });
    
    // Действия
    columns.push({ 
        data: null, 
        title: 'Действия',
        orderable: false,
        searchable: false,
        render: (data, type, row) => {
            return `
                <div class="action-buttons">
                    <button class="btn btn-primary btn-icon" onclick="editProduct(${row.id})" title="Редактировать">✏️</button>
                    <button class="btn btn-danger btn-icon" onclick="deleteProduct(${row.id})" title="Удалить">🗑️</button>
                </div>
            `;
        }
    });
    
    // Создаем HTML таблицы
    const tableHtml = `
        <table id="productsDataTable" class="display compact" style="width:100%">
        </table>
    `;
    
    document.getElementById('productsTable').innerHTML = tableHtml;
    
    // Инициализируем DataTables
    productsDataTable = $('#productsDataTable').DataTable({
        data: products,
        columns: columns,
        pageLength: -1, // Показывать все записи по умолчанию
        lengthMenu: [[-1, 10, 25, 50, 100], ["Все", 10, 25, 50, 100]],
        language: {
            "processing": "Подождите...",
            "search": "Поиск:",
            "lengthMenu": "Показать _MENU_",
            "info": "Записи с _START_ до _END_ из _TOTAL_ записей",
            "infoEmpty": "Записи с 0 до 0 из 0 записей",
            "infoFiltered": "(отфильтровано из _MAX_ записей)",
            "loadingRecords": "Загрузка записей...",
            "zeroRecords": "Записи отсутствуют.",
            "emptyTable": "В таблице отсутствуют данные",
            "paginate": {
                "first": "Первая",
                "previous": "Предыдущая",
                "next": "Следующая",
                "last": "Последняя"
            },
            "aria": {
                "sortAscending": ": активировать для сортировки столбца по возрастанию",
                "sortDescending": ": активировать для сортировки столбца по убыванию"
            },
            "select": {
                "rows": {
                    "_": "Выбрано записей: %d",
                    "1": "Выбрана одна запись"
                },
                "cells": {
                    "1": "1 ячейка выбрана",
                    "_": "Выбрано %d ячеек"
                },
                "columns": {
                    "1": "1 столбец выбран",
                    "_": "Выбрано %d столбцов"
                }
            },
            "buttons": {
                "print": "Печать",
                "copy": "Копировать",
                "copyTitle": "Скопировать в буфер обмена",
                "copySuccess": {
                    "_": "Скопировано %d строк",
                    "1": "Скопирована 1 строка"
                },
                "excel": "Excel",
                "csv": "CSV"
            }
        },
        dom: 'Blfrtip',
        buttons: [
            {
                extend: 'copy',
                text: '📋 Копировать',
                className: 'btn btn-secondary'
            },
            {
                extend: 'csv',
                text: '📄 CSV',
                className: 'btn btn-secondary'
            },
            {
                extend: 'excel',
                text: '📊 Excel',
                className: 'btn btn-success',
                filename: 'Товары_склад'
            },
            {
                extend: 'print',
                text: '🖨️ Печать',
                className: 'btn btn-secondary'
            }
        ],
        colReorder: true,
        order: [[0, 'desc']], // Сортировка по ID по умолчанию
        autoWidth: false, // Отключаем автоширину DataTables
        columnDefs: [
            { targets: 0, width: '50px' }, // ID - фиксированная узкая
            { targets: 1, width: 'auto' }, // Название - авто
            { targets: 2, width: '150px' }, // SKU - средняя
            { targets: -2, width: '80px', className: 'dt-right' }, // Количество - узкая, выравнивание вправо
            { targets: -1, width: '100px', className: 'dt-center', orderable: false } // Действия - фиксированная, по центру
        ]
    });
    
    // Обработчик изменения порядка колонок - сохраняем в localStorage
    productsDataTable.on('column-reorder', function (e, settings, details) {
        // Получаем новый порядок колонок
        const columnOrder = productsDataTable.colReorder.order();
        
        // Сохраняем в localStorage
        localStorage.setItem('datatables_column_order', JSON.stringify(columnOrder));
        console.log('Column order saved to localStorage:', columnOrder);
    });
    
    // Загружаем сохраненный порядок колонок из localStorage
    try {
        const savedOrderStr = localStorage.getItem('datatables_column_order');
        if (savedOrderStr) {
            const savedOrder = JSON.parse(savedOrderStr);
            if (Array.isArray(savedOrder) && savedOrder.length === columns.length) {
                productsDataTable.colReorder.order(savedOrder);
                console.log('Column order restored from localStorage:', savedOrder);
            }
        }
    } catch (error) {
        console.log('No saved column order found, using default');
    }
    
    // Скрываем стандартное поле поиска, используем свое
    $('.dataTables_filter').hide();
}

// Инициализация обработчиков поиска (вызывается один раз при загрузке)
function initSearchHandlers() {
    const searchInput = $('#searchProduct');
    const clearBtn = $('#clearSearch');
    
    // Обработчик ввода в поле поиска
    searchInput.on('input', function() {
        const value = this.value;
        
        // Если таблица существует - ищем в ней
        if (productsDataTable) {
            productsDataTable.search(value).draw();
        }
        
        // Показываем/скрываем кнопку очистки
        if (value.length > 0) {
            clearBtn.addClass('visible');
        } else {
            clearBtn.removeClass('visible');
        }
    });
    
    // Обработчик кнопки очистки
    clearBtn.on('click', function() {
        searchInput.val('');
        
        // Если таблица существует - очищаем поиск
        if (productsDataTable) {
            productsDataTable.search('').draw();
        }
        
        clearBtn.removeClass('visible');
        searchInput.focus();
    });
}



function renderBarcodesDisplay(product) {
    // Новый формат (массив штрихкодов)
    if (product.barcodes && product.barcodes.length > 0) {
        return product.barcodes.map(b =>
            `<small><strong>${b.type}:</strong> <code>${b.value}</code></small>`
        ).join('<br>');
    }
    // Старый формат (одиночный штрихкод)
    if (product.barcode) {
        return `<small><code>${product.barcode}</code></small>`;
    }
    return '<small style="color: #6c757d;">Нет</small>';
}

function renderCustomFieldsDisplay(fields) {
    if (!fields || fields.length === 0) return '<small style="color: #6c757d;">Нет</small>';
    return fields.map(f => `<small><strong>${f.name}:</strong> ${f.value}</small>`).join('<br>');
}


async function deleteProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    if (!confirm(`Удалить товар "${product.name}"?`)) return;

    try {
        await apiCall(`/products/${id}`, 'DELETE');
        await loadData();
        await renderProducts();
        showAlert('Товар удален', 'success');
    } catch (error) {
        console.error('Error deleting product:', error);
        showAlert('Ошибка удаления: ' + error.message, 'error');
    }
}

function updateSelects() {
    const options = products.map(p => {
        let barcodesText = '';
        if (p.barcodes && p.barcodes.length > 0) {
            barcodesText = p.barcodes.map(b => b.value).join(', ');
        } else if (p.barcode) {
            barcodesText = p.barcode;
        }
        return `<option value="${p.id}">${p.name} (${barcodesText}) - Остаток: ${p.quantity}</option>`;
    }).join('');

    const selects = ['receiptProduct', 'shipmentProduct'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const current = select.value;
            select.innerHTML = '<option value="">-- Выберите товар --</option>' + options;
            select.value = current;
        }
    });
}

// Приход товаров
// Приход товаров (новый визард)
let receiptData = {};

function startReceipt() {
    receiptData = {};
    document.getElementById('receiptModalTitle').textContent = '📦 Приход товаров';
    document.getElementById('receiptId').value = '';
    document.getElementById('receiptModal').classList.add('active');

    // Устанавливаем текущую дату
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('receiptDate').value = today;

    document.getElementById('receiptSearchInput').value = '';
    document.getElementById('receiptNote').value = '';
    document.getElementById('receiptSearchResults').innerHTML = '';
    updateReceiptItems();

    // Устанавливаем обработчик поиска
    const searchInput = document.getElementById('receiptSearchInput');
    searchInput.focus();

    searchInput.oninput = function() {
        searchReceiptProducts();
    };
}

function editReceipt(operationId) {
    const operation = operations.find(op => op.id === operationId);
    if (!operation || !operation.items) return;

    receiptData = {};
    document.getElementById('receiptModalTitle').textContent = '✏️ Редактировать приход';
    document.getElementById('receiptId').value = operationId;
    document.getElementById('receiptModal').classList.add('active');

    // Устанавливаем дату прихода
    document.getElementById('receiptDate').value = operation.receiptDate || new Date(operation.date).toISOString().split('T')[0];

    // Загружаем товары из прихода
    operation.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
            receiptData[product.id] = {
                product: product,
                quantity: item.quantity
            };
        }
    });

    document.getElementById('receiptSearchInput').value = '';
    document.getElementById('receiptNote').value = operation.note || '';
    document.getElementById('receiptSearchResults').innerHTML = '';
    updateReceiptItems();

    // Устанавливаем обработчик поиска
    const searchInput = document.getElementById('receiptSearchInput');
    searchInput.oninput = function() {
        searchReceiptProducts();
    };
}

function searchReceiptProducts() {
    const query = document.getElementById('receiptSearchInput').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('receiptSearchResults');

    if (!query) {
        resultsContainer.innerHTML = '';
        return;
    }

    const filtered = products.filter(p => {
        if (p.sku && p.sku.toLowerCase().includes(query)) return true;
        if (p.name.toLowerCase().includes(query)) return true;
        return false;
    }).slice(0, 10); // Показываем только первые 10 результатов

    if (filtered.length === 0) {
        resultsContainer.innerHTML = '<p style="padding: 10px; color: #6c757d;">Товары не найдены</p>';
        return;
    }

    resultsContainer.innerHTML = filtered.map(product => `
                <div class="search-result-item" onclick="addToReceipt(${product.id})">
                    <div class="search-result-name">${product.name}</div>
                    <div class="search-result-sku">SKU: <code>${product.sku}</code> • Остаток: ${product.quantity}</div>
                </div>
            `).join('');
}

function addToReceipt(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (receiptData[productId]) {
        // Товар уже добавлен, увеличиваем количество на 10
        receiptData[productId].quantity += 10;
    } else {
        // Добавляем новый товар с количеством 10
        receiptData[productId] = {
            product: product,
            quantity: 10
        };
    }

    updateReceiptItems();
    showReceiptAlert(`✅ ${product.name} добавлен в приход`, 'success');

    // Очищаем поиск
    document.getElementById('receiptSearchInput').value = '';
    document.getElementById('receiptSearchResults').innerHTML = '';
    document.getElementById('receiptSearchInput').focus();
}

function updateReceiptItems() {
    const container = document.getElementById('receiptItems');
    const countElement = document.getElementById('receiptItemsCount');

    const items = Object.values(receiptData);
    countElement.textContent = items.length;

    if (items.length === 0) {
        container.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">Добавьте товары в приход</p>';
        return;
    }

    container.innerHTML = items.map(item => `
                <div class="receipt-item">
                    <div class="receipt-item-info">
                        <div class="receipt-item-name">${item.product.name}</div>
                        <div class="receipt-item-sku">SKU: <code>${item.product.sku}</code> • Текущий остаток: ${item.product.quantity}</div>
                    </div>
                    <div class="receipt-item-controls">
                        <input type="number" class="receipt-quantity-input" value="${item.quantity}" min="1"
                            onchange="updateReceiptQuantity(${item.product.id}, this.value)">
                        <button class="btn btn-danger btn-icon" onclick="removeFromReceipt(${item.product.id})" 
                            title="Удалить">🗑️</button>
                    </div>
                </div>
            `).join('');
}

function updateReceiptQuantity(productId, quantity) {
    const qty = parseInt(quantity);
    if (qty > 0 && receiptData[productId]) {
        receiptData[productId].quantity = qty;
        updateReceiptItems();
    }
}

function removeFromReceipt(productId) {
    delete receiptData[productId];
    updateReceiptItems();
}

function showReceiptAlert(message, type) {
    const alertDiv = document.getElementById('receiptAlert');
    alertDiv.innerHTML = `<div class="scan-${type}">${message}</div>`;

    setTimeout(() => {
        alertDiv.innerHTML = '';
    }, 2000);
}

function cancelReceipt() {
    if (Object.keys(receiptData).length > 0) {
        if (!confirm('Отменить приход? Все добавленные товары будут потеряны.')) {
            return;
        }
    }
    document.getElementById('receiptModal').classList.remove('active');
    receiptData = {};
}

async function completeReceipt() {
    if (Object.keys(receiptData).length === 0) {
        alert('Добавьте хотя бы один товар в приход!');
        return;
    }

    const receiptId = document.getElementById('receiptId').value;
    const receiptDate = document.getElementById('receiptDate').value;
    const note = document.getElementById('receiptNote').value.trim();

    if (!receiptDate) {
        alert('Укажите дату прихода!');
        return;
    }

    const confirmText = receiptId ? 'Сохранить изменения в приходе?' : 'Провести приход?';
    if (!confirm(`${confirmText}
Товаров: ${Object.keys(receiptData).length}`)) {
        return;
    }

    const receiptItems = [];
    let totalQuantity = 0;

    Object.values(receiptData).forEach(item => {
        totalQuantity += item.quantity;
        receiptItems.push({
            productId: item.product.id,
            productName: item.product.name,
            productSKU: item.product.sku,
            quantity: item.quantity
        });
    });

    try {
        if (receiptId) {
            await apiCall(`/operations/${receiptId}`, 'PUT', {
                operation_date: receiptDate,
                note,
                items: receiptItems,
                total_quantity: totalQuantity
            });
        } else {
            await apiCall('/operations', 'POST', {
                type: 'receipt',
                operation_date: receiptDate,
                note,
                items: receiptItems,
                total_quantity: totalQuantity
            });
        }

        document.getElementById('receiptModal').classList.remove('active');
        receiptData = {};

        await loadData();
        await renderProducts();
        renderReceiptHistory();
        updateReports();

        const message = receiptId ? 'Приход обновлен!' : 'Приход проведен успешно!';
        showAlert(message, 'success');
    } catch (error) {
        console.error('Error completing receipt:', error);
        showReceiptAlert('Ошибка: ' + error.message, 'error');
    }
}

function renderReceiptHistory() {
    const receiptOps = operations.filter(op => op.type === 'receipt').slice(-10).reverse();
    const html = receiptOps.map((op, index) => {
        // Новый формат (с массивом items)
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
        // Старый формат (одиночный товар)
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

async function deleteReceipt(operationId) {
    const operation = operations.find(op => op.id === operationId);
    if (!operation) return;

    const itemsInfo = operation.items
        ? `Товаров: ${operation.items.length}, общее количество: ${operation.totalQuantity}`
        : `${operation.productName}: ${operation.quantity} шт.`;

    if (!confirm(`Удалить приход?
${itemsInfo}

Остатки товаров будут откатаны.`)) {
        return;
    }

    try {
        await apiCall(`/operations/${operationId}`, 'DELETE');
        await loadData();
        await renderProducts();
        renderReceiptHistory();
        updateReports();
        showAlert('Приход удален, остатки откатаны', 'success');
    } catch (error) {
        console.error('Error deleting receipt:', error);
        showAlert('Ошибка удаления: ' + error.message, 'error');
    }
}

// Отгрузка товаров (новый визард)
let shipmentData = {};

function startShipment() {
    shipmentData = {};
    document.getElementById('shipmentModalTitle').textContent = '📤 Отгрузка товаров';
    document.getElementById('shipmentId').value = '';
    document.getElementById('shipmentModal').classList.add('active');

    // Устанавливаем текущую дату
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('shipmentDate').value = today;

    document.getElementById('shipmentSearchInput').value = '';
    document.getElementById('shipmentNote').value = '';
    document.getElementById('shipmentSearchResults').innerHTML = '';
    updateShipmentItems();

    // Устанавливаем обработчик поиска
    const searchInput = document.getElementById('shipmentSearchInput');
    searchInput.focus();

    searchInput.oninput = function() {
        searchShipmentProducts();
    };
}

function editShipment(operationId) {
    const operation = operations.find(op => op.id === operationId);
    if (!operation || !operation.items) return;

    shipmentData = {};
    document.getElementById('shipmentModalTitle').textContent = '✏️ Редактировать отгрузку';
    document.getElementById('shipmentId').value = operationId;
    document.getElementById('shipmentModal').classList.add('active');

    // Устанавливаем дату отгрузки
    document.getElementById('shipmentDate').value = operation.shipmentDate || new Date(operation.date).toISOString().split('T')[0];

    // Загружаем товары из отгрузки
    operation.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
            shipmentData[product.id] = {
                product: product,
                quantity: item.quantity
            };
        }
    });

    document.getElementById('shipmentSearchInput').value = '';
    document.getElementById('shipmentNote').value = operation.note || '';
    document.getElementById('shipmentSearchResults').innerHTML = '';
    updateShipmentItems();

    // Устанавливаем обработчик поиска
    const searchInput = document.getElementById('shipmentSearchInput');
    searchInput.oninput = function() {
        searchShipmentProducts();
    };
}

function searchShipmentProducts() {
    const query = document.getElementById('shipmentSearchInput').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('shipmentSearchResults');

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
                <div class="search-result-item" onclick="addToShipment(${product.id})">
                    <div class="search-result-name">${product.name}</div>
                    <div class="search-result-sku">SKU: <code>${product.sku}</code> • Остаток: ${product.quantity}</div>
                </div>
            `).join('');
}

function addToShipment(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (shipmentData[productId]) {
        // Товар уже добавлен, увеличиваем количество на 10
        shipmentData[productId].quantity += 10;
    } else {
        // Добавляем новый товар с количеством 10
        shipmentData[productId] = {
            product: product,
            quantity: 10
        };
    }

    updateShipmentItems();
    showShipmentAlert(`✅ ${product.name} добавлен в отгрузку`, 'success');

    // Очищаем поиск
    document.getElementById('shipmentSearchInput').value = '';
    document.getElementById('shipmentSearchResults').innerHTML = '';
    document.getElementById('shipmentSearchInput').focus();
}

function updateShipmentItems() {
    const container = document.getElementById('shipmentItems');
    const countElement = document.getElementById('shipmentItemsCount');

    const items = Object.values(shipmentData);
    countElement.textContent = items.length;

    if (items.length === 0) {
        container.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">Добавьте товары в отгрузку</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const isExceedingStock = item.quantity > item.product.quantity;
        const warningStyle = isExceedingStock ? 'border-left-color: #dc3545; background: #fff5f5;' : '';
        const warningText = isExceedingStock ? `<br><span style="color: #dc3545; font-weight: 600;">⚠️ Недостаточно товара!</span>` : '';

        return `
                <div class="receipt-item" style="${warningStyle}">
                    <div class="receipt-item-info">
                        <div class="receipt-item-name">${item.product.name}</div>
                        <div class="receipt-item-sku">SKU: <code>${item.product.sku}</code> • Текущий остаток: ${item.product.quantity}${warningText}</div>
                    </div>
                    <div class="receipt-item-controls">
                        <input type="number" class="receipt-quantity-input" value="${item.quantity}" min="1" max="${item.product.quantity}"
                            onchange="updateShipmentQuantity(${item.product.id}, this.value)"
                            style="${isExceedingStock ? 'border-color: #dc3545;' : ''}">
                        <button class="btn btn-danger btn-icon" onclick="removeFromShipment(${item.product.id})" 
                            title="Удалить">🗑️</button>
                    </div>
                </div>
            `}).join('');
}

function updateShipmentQuantity(productId, quantity) {
    const qty = parseInt(quantity);
    if (qty > 0 && shipmentData[productId]) {
        shipmentData[productId].quantity = qty;
        updateShipmentItems();
    }
}

function removeFromShipment(productId) {
    delete shipmentData[productId];
    updateShipmentItems();
}

function showShipmentAlert(message, type) {
    const alertDiv = document.getElementById('shipmentAlert');
    alertDiv.innerHTML = `<div class="scan-${type}">${message}</div>`;

    setTimeout(() => {
        alertDiv.innerHTML = '';
    }, 2000);
}

function cancelShipment() {
    if (Object.keys(shipmentData).length > 0) {
        if (!confirm('Отменить отгрузку? Все добавленные товары будут потеряны.')) {
            return;
        }
    }
    document.getElementById('shipmentModal').classList.remove('active');
    shipmentData = {};
}

async function completeShipment() {
    if (Object.keys(shipmentData).length === 0) {
        alert('Добавьте хотя бы один товар в отгрузку!');
        return;
    }

    const shipmentId = document.getElementById('shipmentId').value;
    const shipmentDate = document.getElementById('shipmentDate').value;
    const note = document.getElementById('shipmentNote').value.trim();

    if (!shipmentDate) {
        alert('Укажите дату отгрузки!');
        return;
    }

    for (let item of Object.values(shipmentData)) {
        if (item.product.quantity < item.quantity) {
            alert(`Недостаточно товара "${item.product.name}" на складе!
Остаток: ${item.product.quantity}, требуется: ${item.quantity}`);
            return;
        }
    }

    const confirmText = shipmentId ? 'Сохранить изменения в отгрузке?' : 'Провести отгрузку?';
    if (!confirm(`${confirmText}
Товаров: ${Object.keys(shipmentData).length}`)) {
        return;
    }

    const shipmentItems = [];
    let totalQuantity = 0;

    Object.values(shipmentData).forEach(item => {
        totalQuantity += item.quantity;
        shipmentItems.push({
            productId: item.product.id,
            productName: item.product.name,
            productSKU: item.product.sku,
            quantity: item.quantity
        });
    });

    try {
        if (shipmentId) {
            await apiCall(`/operations/${shipmentId}`, 'PUT', {
                operation_date: shipmentDate,
                note,
                items: shipmentItems,
                total_quantity: totalQuantity
            });
        } else {
            await apiCall('/operations', 'POST', {
                type: 'shipment',
                operation_date: shipmentDate,
                note,
                items: shipmentItems,
                total_quantity: totalQuantity
            });
        }

        document.getElementById('shipmentModal').classList.remove('active');
        shipmentData = {};

        await loadData();
        await renderProducts();
        renderShipmentHistory();
        updateReports();

        const message = shipmentId ? 'Отгрузка обновлена!' : 'Отгрузка проведена успешно!';
        showAlert(message, 'success');
    } catch (error) {
        console.error('Error completing shipment:', error);
        showShipmentAlert('Ошибка: ' + error.message, 'error');
    }
}

function renderShipmentHistory() {
    const shipmentOps = operations.filter(op => op.type === 'shipment').slice(-10).reverse();
    const html = shipmentOps.map((op, index) => {
        // Новый формат (с массивом items)
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
        // Старый формат (одиночный товар)
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

    document.getElementById('shipmentHistory').innerHTML =
        shipmentOps.length ? '<h3>История отгрузок</h3>' + html : '';
}

async function deleteShipment(operationId) {
    const operation = operations.find(op => op.id === operationId);
    if (!operation) return;

    const itemsInfo = operation.items
        ? `Товаров: ${operation.items.length}, общее количество: ${operation.totalQuantity}`
        : `${operation.productName}: ${operation.quantity} шт.`;

    if (!confirm(`Удалить отгрузку?
${itemsInfo}

Товары будут возвращены на склад.`)) {
        return;
    }

    try {
        await apiCall(`/operations/${operationId}`, 'DELETE');
        await loadData();
        await renderProducts();
        renderShipmentHistory();
        updateReports();
        showAlert('Отгрузка удалена, товары возвращены на склад', 'success');
    } catch (error) {
        console.error('Error deleting shipment:', error);
        showAlert('Ошибка удаления: ' + error.message, 'error');
    }
}

// ==================== ИНВЕНТАРИЗАЦИЯ С КОРОБАМИ ====================
let inventoryData = {
    boxes: [], // Массив коробов с товарами
    currentBox: {}, // Текущий короб (товары которые пикаем сейчас)
    boxCounter: 0 // Счетчик коробов
};

function startInventory() {
    inventoryData = {
        boxes: [],
        currentBox: {},
        boxCounter: 0
    };
    
    document.getElementById('inventoryModal').classList.add('active');
    document.getElementById('scanInput').focus();
    updateInventoryUI();
    
    const scanInput = document.getElementById('scanInput');
    scanInput.value = '';
    
    // Удаляем старые обработчики
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

function processScan() {
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

function completeCurrentBox() {
    if (Object.keys(inventoryData.currentBox).length === 0) {
        alert('Короб пуст! Отсканируйте хотя бы один товар.');
        return;
    }
    
    inventoryData.boxCounter++;
    
    // Сохраняем текущий короб
    inventoryData.boxes.push({
        boxNumber: inventoryData.boxCounter,
        items: { ...inventoryData.currentBox },
        timestamp: new Date().toISOString()
    });
    
    // Очищаем текущий короб
    inventoryData.currentBox = {};
    
    showScanAlert(`✅ Короб #${inventoryData.boxCounter} готов! Можно начинать следующий.`, 'success');
    updateInventoryUI();
    document.getElementById('scanInput').focus();
}

function updateInventoryUI() {
    // Обновляем текущий короб
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
    `;
    
    // Обновляем список готовых коробов
    if (inventoryData.boxes.length > 0) {
        const boxesHtml = inventoryData.boxes.slice().reverse().map(box => {
            const boxItems = Object.values(box.items);
            const totalCount = boxItems.reduce((sum, item) => sum + item.count, 0);
            
            return `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #dee2e6;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4 style="margin: 0; color: #28a745;">✅ Короб #${box.boxNumber}</h4>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn-secondary btn-icon" onclick="downloadBoxLabel(${box.boxNumber})" title="Скачать этикетку">🏷️</button>
                            <button class="btn btn-danger btn-icon" onclick="removeBox(${box.boxNumber})" title="Удалить короб">🗑️</button>
                        </div>
                    </div>
                    <div style="font-size: 13px; color: #6c757d; margin-bottom: 10px;">
                        Позиций: ${boxItems.length} | Всего штук: ${totalCount}
                    </div>
                    <div style="max-height: 150px; overflow-y: auto;">
                        ${boxItems.map(item => `
                            <div style="padding: 6px; border-bottom: 1px solid #e9ecef; display: flex; justify-content: space-between;">
                                <span style="font-size: 13px;">${item.product.name}</span>
                                <span style="font-weight: bold; color: #28a745;">${item.count} шт.</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
        
        document.getElementById('scannedItems').innerHTML += `
            <div style="margin-top: 20px;">
                <h4 style="margin-bottom: 15px;">📋 Готовые коробы (${inventoryData.boxes.length})</h4>
                ${boxesHtml}
            </div>
        `;
    }
    
    // Обновляем общий счетчик
    const totalBoxes = inventoryData.boxes.length;
    const totalScanned = inventoryData.boxes.reduce((sum, box) => {
        return sum + Object.values(box.items).reduce((s, item) => s + item.count, 0);
    }, 0) + currentBoxCount;
    
    document.getElementById('scannedCount').textContent = 
        `${totalBoxes} коробов, ${totalScanned} шт. (+ текущий короб: ${currentBoxCount} шт.)`;
}

function removeScannedItem(productId) {
    if (inventoryData.currentBox[productId]) {
        delete inventoryData.currentBox[productId];
        updateInventoryUI();
    }
}

function incrementInventoryItem(productId) {
    if (inventoryData.currentBox[productId]) {
        inventoryData.currentBox[productId].count++;
        updateInventoryUI();
        
        // Анимация увеличения
        const item = document.querySelector(`.scanned-item[data-product-id="${productId}"] .scanned-item-count`);
        if (item) {
            item.style.animation = 'pulse 0.3s ease-in-out';
            setTimeout(() => item.style.animation = '', 300);
        }
    }
}

function decrementInventoryItem(productId) {
    if (inventoryData.currentBox[productId]) {
        if (inventoryData.currentBox[productId].count > 1) {
            inventoryData.currentBox[productId].count--;
            updateInventoryUI();
            
            // Анимация уменьшения
            const item = document.querySelector(`.scanned-item[data-product-id="${productId}"] .scanned-item-count`);
            if (item) {
                item.style.animation = 'pulse 0.3s ease-in-out';
                setTimeout(() => item.style.animation = '', 300);
            }
        } else {
            // Если количество = 1, предлагаем удалить товар
            if (confirm('Удалить товар из короба?')) {
                removeScannedItem(productId);
            }
        }
    }
}

function removeBox(boxNumber) {
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

function cancelInventory() {
    if (inventoryData.boxes.length > 0 || Object.keys(inventoryData.currentBox).length > 0) {
        if (!confirm('Отменить инвентаризацию? Все отсканированные данные будут потеряны.')) {
            return;
        }
    }
    
    document.getElementById('inventoryModal').classList.remove('active');
    inventoryData = { boxes: [], currentBox: {}, boxCounter: 0 };
}

async function completeInventory() {
    // Проверяем что есть готовые коробы
    if (inventoryData.boxes.length === 0) {
        alert('Нет готовых коробов! Завершите хотя бы один короб перед завершением инвентаризации.');
        return;
    }
    
    // Если есть незавершенный текущий короб - предупреждаем
    if (Object.keys(inventoryData.currentBox).length > 0) {
        if (!confirm('У вас есть незавершенный короб. Завершить его автоматически и продолжить?')) {
            return;
        }
        completeCurrentBox();
    }
    
    // Закрываем модалку сканирования
    document.getElementById('inventoryModal').classList.remove('active');
    
    // Показываем модалку с результатами
    showInventoryResults();
}

function showInventoryResults() {
    // Собираем общую статистику по всем коробам
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
    
    // Вычисляем расхождения
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
                expected: expected,
                actual: actual,
                diff: diff
            });
        } else {
            noChanges.push({
                productName: item.product.name,
                sku: item.product.sku,
                quantity: actual
            });
        }
    });
    
    // Формируем HTML с табами
    const modalHTML = `
        <div id="inventoryResultsModal" class="modal active">
            <div class="modal-content" style="max-width: 1000px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;">
                <h2>📊 Результаты инвентаризации</h2>
                
                <div style="background: #e8f4f8; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                        <div style="text-align: center;">
                            <div style="font-size: 13px; color: #6c757d;">Всего коробов</div>
                            <div style="font-size: 24px; font-weight: bold; color: #667eea;">${inventoryData.boxes.length}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 13px; color: #6c757d;">Позиций проверено</div>
                            <div style="font-size: 24px; font-weight: bold; color: #667eea;">${Object.keys(totalItems).length}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 13px; color: #6c757d;">Расхождений</div>
                            <div style="font-size: 24px; font-weight: bold; color: ${differences.length > 0 ? '#dc3545' : '#28a745'};">${differences.length}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Табы -->
                <div style="display: flex; gap: 10px; border-bottom: 2px solid #e9ecef; margin-bottom: 20px;">
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
                
                <!-- Контент табов -->
                <div style="flex: 1; overflow-y: auto; margin-bottom: 20px;">
                    <!-- Таб: Коробы -->
                    <div id="result-tab-boxes" class="result-tab-content active">
                        ${inventoryData.boxes.map(box => {
                            const boxItems = Object.values(box.items);
                            const totalCount = boxItems.reduce((sum, item) => sum + item.count, 0);
                            
                            return `
                                <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #dee2e6;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                        <h4 style="margin: 0; color: #667eea;">Короб #${box.boxNumber}</h4>
                                        <button class="btn btn-secondary" onclick="downloadBoxLabel(${box.boxNumber})" style="padding: 8px 15px; font-size: 13px;">
                                            🏷️ Скачать этикетку
                                        </button>
                                    </div>
                                    <div style="font-size: 13px; color: #6c757d; margin-bottom: 10px;">
                                        Позиций: ${boxItems.length} | Всего штук: ${totalCount}
                                    </div>
                                    <table style="width: 100%; font-size: 13px;">
                                        <thead>
                                            <tr style="background: #e9ecef;">
                                                <th style="padding: 8px; text-align: left;">Товар</th>
                                                <th style="padding: 8px; text-align: left;">SKU</th>
                                                <th style="padding: 8px; text-align: right;">Количество</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${boxItems.map(item => `
                                                <tr style="border-bottom: 1px solid #e9ecef;">
                                                    <td style="padding: 8px;">${item.product.name}</td>
                                                    <td style="padding: 8px;"><code>${item.product.sku}</code></td>
                                                    <td style="padding: 8px; text-align: right; font-weight: bold;">${item.count}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    
                    <!-- Таб: Расхождения -->
                    <div id="result-tab-differences" class="result-tab-content">
                        ${differences.length > 0 ? `
                            <table style="width: 100%; font-size: 13px;">
                                <thead>
                                    <tr style="background: #f8d7da;">
                                        <th style="padding: 10px; text-align: left;">Товар</th>
                                        <th style="padding: 10px; text-align: left;">SKU</th>
                                        <th style="padding: 10px; text-align: right;">Было в системе</th>
                                        <th style="padding: 10px; text-align: right;">Фактически</th>
                                        <th style="padding: 10px; text-align: right;">Разница</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${differences.map(diff => `
                                        <tr style="border-bottom: 1px solid #e9ecef;">
                                            <td style="padding: 10px;">${diff.productName}</td>
                                            <td style="padding: 10px;"><code>${diff.sku}</code></td>
                                            <td style="padding: 10px; text-align: right;">${diff.expected}</td>
                                            <td style="padding: 10px; text-align: right; font-weight: bold;">${diff.actual}</td>
                                            <td style="padding: 10px; text-align: right; font-weight: bold; color: ${diff.diff > 0 ? '#28a745' : '#dc3545'};">
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
                                <p style="color: #6c757d;">Все товары совпадают с данными в системе.</p>
                            </div>
                        `}
                    </div>
                    
                    <!-- Таб: Без изменений -->
                    <div id="result-tab-nochanges" class="result-tab-content">
                        ${noChanges.length > 0 ? `
                            <table style="width: 100%; font-size: 13px;">
                                <thead>
                                    <tr style="background: #d4edda;">
                                        <th style="padding: 10px; text-align: left;">Товар</th>
                                        <th style="padding: 10px; text-align: left;">SKU</th>
                                        <th style="padding: 10px; text-align: right;">Количество</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${noChanges.map(item => `
                                        <tr style="border-bottom: 1px solid #e9ecef;">
                                            <td style="padding: 10px;">${item.productName}</td>
                                            <td style="padding: 10px;"><code>${item.sku}</code></td>
                                            <td style="padding: 10px; text-align: right; font-weight: bold; color: #28a745;">${item.quantity} ✓</td>
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
                
                <!-- Кнопки -->
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
            
            .result-tab:hover {
                color: #667eea;
            }
            
            .result-tab.active {
                color: #667eea;
                border-bottom-color: #667eea;
            }
            
            .result-tab-content {
                display: none;
            }
            
            .result-tab-content.active {
                display: block;
            }
        </style>
    `;
    
    // Вставляем модалку в body
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = modalHTML;
    document.body.appendChild(tempDiv.firstElementChild);
    
    // Сохраняем данные для применения
    window.inventoryResultsData = { totalItems, differences };
}

function switchResultTab(tabName) {
    // Переключаем табы
    document.querySelectorAll('.result-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`.result-tab[data-tab="${tabName}"]`).classList.add('active');
    
    // Переключаем контент
    document.querySelectorAll('.result-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`result-tab-${tabName}`).classList.add('active');
}

async function applyInventoryResults() {
    if (!confirm('Применить результаты инвентаризации? Остатки товаров будут обновлены.')) {
        return;
    }
    
    try {
        const { totalItems, differences } = window.inventoryResultsData;
        
        // Создаем операцию инвентаризации
        await apiCall('/operations', 'POST', {
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
        
        // Закрываем модалку результатов
        document.getElementById('inventoryResultsModal').remove();
        
        // Очищаем данные
        inventoryData = { boxes: [], currentBox: {}, boxCounter: 0 };
        delete window.inventoryResultsData;
        
        // Обновляем данные
        await loadData();
        await renderProducts();
        renderInventoryHistory();
        updateReports();
        
        showAlert('✅ Инвентаризация завершена! Остатки обновлены.', 'success');
    } catch (error) {
        console.error('Error applying inventory:', error);
        alert('Ошибка применения инвентаризации: ' + error.message);
    }
}

function cancelInventoryResults() {
    if (!confirm('Отменить инвентаризацию? Все данные будут потеряны.')) {
        return;
    }
    
    document.getElementById('inventoryResultsModal').remove();
    inventoryData = { boxes: [], currentBox: {}, boxCounter: 0 };
    delete window.inventoryResultsData;
    
    showAlert('Инвентаризация отменена', 'info');
}

function backToInventory() {
    // Закрываем модалку результатов
    document.getElementById('inventoryResultsModal').remove();
    
    // Удаляем временные данные результатов
    delete window.inventoryResultsData;
    
    // Открываем обратно модалку инвентаризации
    document.getElementById('inventoryModal').classList.add('active');
    
    // Обновляем UI с сохраненными данными
    updateInventoryUI();
    
    // Возвращаем фокус на поле сканирования
    setTimeout(() => {
        document.getElementById('scanInput').focus();
    }, 100);
    
    showScanAlert('Вы вернулись к инвентаризации. Можете продолжить сканирование.', 'success');
}

function renderInventoryHistory() {
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


// Отчеты
async function updateReports() {
    try {
        const stats = await apiCall('/stats');

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


// Уведомления
function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    document.querySelector('.content').insertBefore(
        alertDiv,
        document.querySelector('.tab-content.active')
    );

    setTimeout(() => alertDiv.remove(), 3000);
}

function showModalAlert(message, type) {
    document.getElementById('modalAlert').innerHTML =
        `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => {
        document.getElementById('modalAlert').innerHTML = '';
    }, 3000);
}

// Запуск приложения
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ==================== ESCAPE KEY HANDLER ====================
// Закрытие модальных окон по нажатию Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        // Проверяем какие модальные окна открыты и закрываем их
        
        // Модальное окно товара
        const productModal = document.getElementById('productModal');
        if (productModal && productModal.classList.contains('active')) {
            closeModal();
            return;
        }
        
        // Модальное окно инвентаризации
        const inventoryModal = document.getElementById('inventoryModal');
        if (inventoryModal && inventoryModal.classList.contains('active')) {
            // Показываем подтверждение если есть данные
            if (inventoryData.boxes.length > 0 || Object.keys(inventoryData.currentBox).length > 0) {
                if (confirm('Отменить инвентаризацию? Все отсканированные данные будут потеряны.')) {
                    cancelInventory();
                }
            } else {
                cancelInventory();
            }
            return;
        }
        
        // Модальное окно прихода
        const receiptModal = document.getElementById('receiptModal');
        if (receiptModal && receiptModal.classList.contains('active')) {
            // Показываем подтверждение если есть данные
            if (Object.keys(receiptData).length > 0) {
                if (confirm('Отменить приход? Все добавленные товары будут потеряны.')) {
                    cancelReceipt();
                }
            } else {
                cancelReceipt();
            }
            return;
        }
        
        // Модальное окно отгрузки
        const shipmentModal = document.getElementById('shipmentModal');
        if (shipmentModal && shipmentModal.classList.contains('active')) {
            // Показываем подтверждение если есть данные
            if (Object.keys(shipmentData).length > 0) {
                if (confirm('Отменить отгрузку? Все добавленные товары будут потеряны.')) {
                    cancelShipment();
                }
            } else {
                cancelShipment();
            }
            return;
        }
        
        // Модальное окно списания
        const writeoffModal = document.getElementById('writeoffModal');
        if (writeoffModal && writeoffModal.classList.contains('active')) {
            // Показываем подтверждение если есть данные
            if (Object.keys(writeoffData).length > 0) {
                if (confirm('Отменить списание? Все добавленные товары будут потеряны.')) {
                    cancelWriteoff();
                }
            } else {
                cancelWriteoff();
            }
            return;
        }
        
        // Модальное окно результатов инвентаризации
        const inventoryResultsModal = document.getElementById('inventoryResultsModal');
        if (inventoryResultsModal) {
            if (confirm('Отменить инвентаризацию? Все данные будут потеряны.')) {
                cancelInventoryResults();
            }
            return;
        }
    }
});

// ==================== ГЕНЕРАЦИЯ PDF ЭТИКЕТОК ====================

function generateBoxLabel(boxNumber, items) {
    const { jsPDF } = window.jspdf;
    
    // Размеры этикетки 58x40мм
    const labelWidth = 58;
    const labelHeight = 40;
    
    // Создаем PDF с размером первой этикетки
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [labelHeight, labelWidth]
    });
    
    // Параметры для текста
    const margin = 2;
    const lineHeight = 3.5;
    
    // Максимальное количество строк на одной этикетке
    const maxLinesPerLabel = Math.floor((labelHeight - margin * 2 - 6) / lineHeight);
    
    // Функция для транслитерации кириллицы
    const transliterate = (text) => {
        const map = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
            'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
            'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
            'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
            'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
            'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
            'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
            'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
            'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '',
            'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
        };
        return text.split('').map(char => map[char] || char).join('');
    };
    
    // Собираем все строки
    const allLines = [];
    
    // Заголовок короба
    allLines.push({
        text: `BOX #${boxNumber}`,
        fontSize: 12,
        bold: true,
        isHeader: true
    });
    
    allLines.push({
        text: `Items: ${items.length}`,
        fontSize: 8,
        bold: false,
        isSubheader: true
    });
    
    allLines.push({
        text: '--------------------------------',
        fontSize: 7,
        bold: false,
        isSeparator: true
    });
    
    // Добавляем товары
    items.forEach((item, index) => {
        const totalCount = item.count;
        const productName = transliterate(item.product.name);
        const productSKU = item.product.sku;
        
        allLines.push({
            text: `${index + 1}. ${productName}`,
            fontSize: 8,
            bold: true,
            isProduct: true
        });
        
        allLines.push({
            text: `   SKU: ${productSKU}`,
            fontSize: 7,
            bold: false,
            isSKU: true
        });
        
        allLines.push({
            text: `   Qty: ${totalCount} pcs`,
            fontSize: 8,
            bold: true,
            isQuantity: true
        });
    });
    
    // Разбиваем на страницы
    let pageCount = 0;
    let lineIndex = 0;
    
    while (lineIndex < allLines.length) {
        if (pageCount > 0) {
            doc.addPage([labelHeight, labelWidth], 'landscape');
        }
        
        let currentY = margin + 4;
        let linesOnPage = 0;
        
        // Заголовок на каждой странице
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`BOX #${boxNumber} (${pageCount + 1})`, labelWidth / 2, margin + 3, { align: 'center' });
        
        currentY = margin + 7;
        
        // Добавляем строки на текущую страницу
        while (lineIndex < allLines.length && linesOnPage < maxLinesPerLabel) {
            const line = allLines[lineIndex];
            
            // Пропускаем заголовок на страницах 2+
            if (pageCount > 0 && (line.isHeader || line.isSubheader)) {
                lineIndex++;
                continue;
            }
            
            // Устанавливаем стиль
            doc.setFontSize(line.fontSize);
            doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
            
            // Проверяем длину текста
            const textWidth = doc.getTextWidth(line.text);
            const maxWidth = labelWidth - margin * 2;
            
            if (textWidth > maxWidth) {
                // Текст не влезает - разбиваем на несколько строк
                const words = line.text.split(' ');
                let currentLine = '';
                
                for (const word of words) {
                    const testLine = currentLine + (currentLine ? ' ' : '') + word;
                    const testWidth = doc.getTextWidth(testLine);
                    
                    if (testWidth > maxWidth && currentLine) {
                        // Выводим накопленную строку
                        doc.text(currentLine, margin, currentY);
                        currentY += lineHeight;
                        linesOnPage++;
                        currentLine = word;
                        
                        if (linesOnPage >= maxLinesPerLabel) break;
                    } else {
                        currentLine = testLine;
                    }
                }
                
                // Выводим остаток
                if (currentLine && linesOnPage < maxLinesPerLabel) {
                    doc.text(currentLine, margin, currentY);
                    currentY += lineHeight;
                    linesOnPage++;
                }
            } else {
                // Текст влезает
                doc.text(line.text, margin, currentY);
                currentY += lineHeight;
                linesOnPage++;
            }
            
            lineIndex++;
            
            if (linesOnPage >= maxLinesPerLabel) break;
        }
        
        pageCount++;
    }
    
    // Сохраняем PDF
    doc.save(`Label_Box_${boxNumber}.pdf`);
}


function downloadBoxLabel(boxNumber) {
    const box = inventoryData.boxes.find(b => b.boxNumber === boxNumber);
    
    if (!box) {
        alert('Короб не найден!');
        return;
    }
    
    const items = Object.values(box.items);
    generateBoxLabel(boxNumber, items);
}


// ==================== ACCORDION ====================
function toggleAccordion(id) {
    const content = document.getElementById(id);
    const header = content.previousElementSibling;
    const icon = header.querySelector('.accordion-icon');
    
    if (content.classList.contains('active')) {
        content.classList.remove('active');
        icon.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('active');
        icon.style.transform = 'rotate(90deg)';
    }
}
// ==================== СПИСАНИЯ ТОВАРОВ ====================
let writeoffData = {};
let writeoffsList = [];
let writeoffsSummary = [];

async function loadWriteoffs() {
    try {
        writeoffsList = await apiCall('/writeoffs');
        writeoffsSummary = await apiCall('/writeoffs/summary');
    } catch (error) {
        console.error('Error loading writeoffs:', error);
    }
}

function startWriteoff() {
    writeoffData = {};
    document.getElementById('writeoffModal').classList.add('active');
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('writeoffDate').value = today;
    
    document.getElementById('writeoffSearchInput').value = '';
    document.getElementById('writeoffNote').value = '';
    renderWriteoffItems();
}

function searchWriteoffProduct() {
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
        <div style="padding: 10px; border: 1px solid #dee2e6; border-radius: 4px; margin-bottom: 5px; cursor: pointer; background: white;"
             onclick="addWriteoffProduct(${p.id})">
            <strong>${p.name}</strong><br>
            <small>SKU: ${p.sku} | В наличии: ${p.quantity} шт.</small>
        </div>
    `).join('');
    
    document.getElementById('writeoffSearchResults').innerHTML = html;
}

function addWriteoffProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    if (!writeoffData[productId]) {
        writeoffData[productId] = {
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

function renderWriteoffItems() {
    const items = Object.values(writeoffData);
    const totalQty = items.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);
    
    document.getElementById('writeoffItemsCount').textContent = items.length;
    
    const reasonLabels = {
        defect: '🔴 Брак',
        loss: '❌ Потеря',
        reserve: '🔵 Резерв'
    };
    
    const html = items.map(item => `
        <div style="background: white; padding: 15px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #dee2e6;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div style="flex: 1;">
                    <strong>${item.product.name}</strong><br>
                    <small>SKU: ${item.product.sku} | В наличии: ${item.product.quantity} шт.</small>
                </div>
                <button class="btn btn-danger btn-icon" onclick="removeWriteoffItem(${item.product.id})">✕</button>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 10px;">
                <div>
                    <label style="font-size: 12px; color: #6c757d;">Количество</label>
                    <input type="number" min="1" max="${item.product.quantity}" value="${item.quantity}"
                           onchange="writeoffData[${item.product.id}].quantity = parseInt(this.value) || 1; renderWriteoffItems()"
                           style="width: 100%; padding: 8px;">
                </div>
                
                <div>
                    <label style="font-size: 12px; color: #6c757d;">Причина</label>
                    <select onchange="writeoffData[${item.product.id}].reason = this.value"
                            style="width: 100%; padding: 8px;">
                        <option value="defect" ${item.reason === 'defect' ? 'selected' : ''}>🔴 Брак</option>
                        <option value="loss" ${item.reason === 'loss' ? 'selected' : ''}>❌ Потеря</option>
                        <option value="reserve" ${item.reason === 'reserve' ? 'selected' : ''}>🔵 Резерв</option>
                    </select>
                </div>
                
                <div>
                    <label style="font-size: 12px; color: #6c757d;">Примечание</label>
                    <input type="text" placeholder="Необязательно..." value="${item.note || ''}"
                           onchange="writeoffData[${item.product.id}].note = this.value"
                           style="width: 100%; padding: 8px;">
                </div>
            </div>
        </div>
    `).join('') || '<p style="text-align: center; color: #6c757d;">Список пуст</p>';
    
    document.getElementById('writeoffItems').innerHTML = html;
}

function removeWriteoffItem(productId) {
    delete writeoffData[productId];
    renderWriteoffItems();
}

function cancelWriteoff() {
    document.getElementById('writeoffModal').classList.remove('active');
    writeoffData = {};
}

async function completeWriteoff() {
    const items = Object.values(writeoffData);
    if (items.length === 0) {
        alert('Добавьте хотя бы один товар!');
        return;
    }
    
    const date = document.getElementById('writeoffDate').value;
    const note = document.getElementById('writeoffNote').value;
    
    try {
        const totalQuantity = items.reduce((sum, item) => sum + parseInt(item.quantity), 0);
        
        await apiCall('/operations', 'POST', {
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
        writeoffData = {};
        
        await loadData();
        await loadWriteoffs();
        await renderProducts();
        renderWriteoffHistory();
        renderWriteoffSummary();
        
        showAlert(`✅ Списание на ${totalQuantity} шт. проведено`, 'success');
    } catch (error) {
        console.error('Error completing writeoff:', error);
        alert('Ошибка списания: ' + error.message);
    }
}

function renderWriteoffHistory() {
    const writeoffOps = operations.filter(op => op.type === 'writeoff').slice(-10).reverse();
    
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

function renderWriteoffSummary() {
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

async function deleteWriteoff(operationId) {
    if (!confirm('Удалить списание? Товары будут возвращены на склад.')) {
        return;
    }
    
    try {
        await apiCall(`/operations/${operationId}`, 'DELETE');
        await loadData();
        await loadWriteoffs();
        await renderProducts();
        renderWriteoffHistory();
        renderWriteoffSummary();
        showAlert('Списание отменено, товары возвращены', 'success');
    } catch (error) {
        console.error('Error deleting writeoff:', error);
        alert('Ошибка удаления: ' + error.message);
    }
}
// ==================== ИМПОРТ ИЗ EXCEL ====================
let importData = {
    file: null,
    rawData: [],
    headers: [],
    mapping: {},
    preview: [],
    skipFirstRow: true
};

function showImportModal() {
    document.getElementById('importModal').classList.add('active');
    document.getElementById('importStep1').style.display = 'block';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importNextBtn').style.display = 'none';
    document.getElementById('importExecuteBtn').style.display = 'none';
    
    // Сброс данных
    importData = {
        file: null,
        rawData: [],
        headers: [],
        mapping: {},
        preview: [],
        skipFirstRow: true
    };
    
    document.getElementById('fileInfo').style.display = 'none';
    
    // Настройка drag & drop
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
        
        const file = e.dataTransfer.files[0];
        handleImportFile(file);
    };
    
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        handleImportFile(file);
    };
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
}

function handleImportFile(file) {
    if (!file) return;
    
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
        alert('Пожалуйста, выберите файл Excel (.xlsx или .xls)');
        return;
    }
    
    importData.file = file;
    
    document.getElementById('fileInfo').innerHTML = `
        <div style="background: #d4edda; padding: 15px; border-radius: 6px; border-left: 4px solid #28a745;">
            <strong>✅ Файл загружен:</strong> ${file.name} (${(file.size / 1024).toFixed(2)} KB)
        </div>
    `;
    document.getElementById('fileInfo').style.display = 'block';
    document.getElementById('importNextBtn').style.display = 'inline-block';
}

async function processImportFile() {
    try {
        showAlert('Обработка файла...', 'info');
        
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Берем первый лист
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                
                if (jsonData.length === 0) {
                    alert('Файл пуст!');
                    return;
                }
                
                importData.rawData = jsonData;
                importData.headers = jsonData[0] || [];
                
                // Автоматический маппинг
                autoMapFields();
                
                // Переход к шагу 2
                document.getElementById('importStep1').style.display = 'none';
                document.getElementById('importStep2').style.display = 'block';
                document.getElementById('importNextBtn').style.display = 'none';
                document.getElementById('importExecuteBtn').style.display = 'inline-block';
                
                renderMapping();
                updatePreview();
                
                showAlert('', 'info'); // Убираем сообщение
            } catch (error) {
                console.error('Error processing Excel:', error);
                alert('Ошибка обработки файла: ' + error.message);
            }
        };
        
        reader.readAsArrayBuffer(importData.file);
    } catch (error) {
        console.error('Error:', error);
        alert('Ошибка: ' + error.message);
    }
}

function autoMapFields() {
    // Поля товаров
    const productFields = [
        { key: 'name', label: 'Название', required: true },
        { key: 'sku', label: 'SKU', required: true },
        { key: 'quantity', label: 'Количество', required: false },
        { key: 'description', label: 'Описание', required: false }
    ];
    
    // Добавляем кастомные поля
    productFieldsSettings.forEach(field => {
        productFields.push({
            key: `custom_${field.name}`,
            label: field.name,
            required: field.required || false,
            isCustom: true
        });
    });
    
    // Автоматический маппинг по названиям
    importData.mapping = {};
    
    importData.headers.forEach((header, index) => {
        const headerLower = String(header).toLowerCase().trim();
        
        // Поиск соответствия
        for (const field of productFields) {
            const fieldLower = field.label.toLowerCase();
            const keyLower = field.key.toLowerCase();
            
            if (headerLower === fieldLower || 
                headerLower === keyLower || 
                headerLower.includes(fieldLower) ||
                fieldLower.includes(headerLower)) {
                importData.mapping[index] = field.key;
                break;
            }
        }
        
        // Если не нашли - оставляем null (не импортировать)
        if (!importData.mapping[index]) {
            importData.mapping[index] = null;
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
    
    // Добавляем кастомные поля
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
                ${importData.headers.map((header, index) => {
                    const exampleData = importData.rawData[1] ? importData.rawData[1][index] : '';
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
                                        <option value="${field.key}" ${importData.mapping[index] === field.key ? 'selected' : ''}>
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

function updatePreview() {
    const skipFirst = document.getElementById('skipFirstRow').checked;
    importData.skipFirstRow = skipFirst;
    
    const startRow = skipFirst ? 1 : 0;
    const previewRows = importData.rawData.slice(startRow, startRow + 5);
    
    // Получаем список полей для предпросмотра
    const fieldsToShow = ['name', 'sku', 'quantity', 'description'];
    productFieldsSettings.forEach(f => fieldsToShow.push(`custom_${f.name}`));
    
    // Получаем существующие SKU для проверки дубликатов
    const existingSKUs = products.map(p => p.sku.toLowerCase().trim());
    
    let newCount = 0;
    let duplicateCount = 0;
    
    const previewData = previewRows.map(row => {
        const item = {};
        
        Object.keys(importData.mapping).forEach(colIndex => {
            const fieldKey = importData.mapping[colIndex];
            if (fieldKey) {
                item[fieldKey] = row[colIndex] || '';
            }
        });
        
        // Проверка дубликата
        if (item.sku) {
            const skuNormalized = String(item.sku).toLowerCase().trim();
            if (existingSKUs.includes(skuNormalized)) {
                item._isDuplicate = true;
                duplicateCount++;
            } else {
                newCount++;
            }
        }
        
        return item;
    });
    
    importData.preview = previewData;
    
    // Таблица предпросмотра
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
    
    // Сводка
    const totalRows = importData.rawData.length - (skipFirst ? 1 : 0);
    document.getElementById('importSummary').innerHTML = `
        <strong>Итого:</strong><br>
        📊 Всего строк в файле: ${totalRows}<br>
        ✅ Новых товаров для импорта: ${totalRows - duplicateCount}<br>
        ⚠️ Дубликатов (будут пропущены): ${duplicateCount}
    `;
}

async function executeImport() {
    try {
        const skipFirst = importData.skipFirstRow;
        const startRow = skipFirst ? 1 : 0;
        const rowsToImport = importData.rawData.slice(startRow);
        
        // Получаем существующие SKU
        const existingSKUs = products.map(p => p.sku.toLowerCase().trim());
        
        const newProducts = [];
        let skippedCount = 0;
        
        for (const row of rowsToImport) {
            const product = {};
            
            // Заполняем поля из маппинга
            Object.keys(importData.mapping).forEach(colIndex => {
                const fieldKey = importData.mapping[colIndex];
                if (fieldKey && row[colIndex] !== undefined && row[colIndex] !== '') {
                    if (fieldKey.startsWith('custom_')) {
                        // Кастомное поле
                        if (!product.custom_fields) product.custom_fields = [];
                        const fieldName = fieldKey.replace('custom_', '');
                        product.custom_fields.push({
                            name: fieldName,
                            value: String(row[colIndex])
                        });
                    } else {
                        // Обычное поле
                        product[fieldKey] = row[colIndex];
                    }
                }
            });
            
            // Проверка обязательных полей
            if (!product.name || !product.sku) {
                continue; // Пропускаем строки без обязательных полей
            }
            
            // Проверка дубликата
            const skuNormalized = String(product.sku).toLowerCase().trim();
            if (existingSKUs.includes(skuNormalized)) {
                skippedCount++;
                continue;
            }
            
            // Устанавливаем значения по умолчанию
            product.quantity = parseInt(product.quantity) || 0;
            product.description = product.description || '';
            product.custom_fields = product.custom_fields || [];
            
            newProducts.push(product);
            existingSKUs.push(skuNormalized); // Добавляем чтобы избежать дубликатов внутри импорта
        }
        
        if (newProducts.length === 0) {
            alert('Нет новых товаров для импорта!');
            return;
        }
        
        if (!confirm(`Импортировать ${newProducts.length} товаров?\n(${skippedCount} дубликатов будет пропущено)`)) {
            return;
        }
        
        showAlert('Импорт товаров...', 'info');
        
        // Импортируем товары
        for (const product of newProducts) {
            await apiCall('/products', 'POST', product);
        }
        
        // Обновляем данные
        await loadData();
        await renderProducts();
        
        closeImportModal();
        showAlert(`✅ Импортировано ${newProducts.length} товаров! (Пропущено дубликатов: ${skippedCount})`, 'success');
        
    } catch (error) {
        console.error('Import error:', error);
        alert('Ошибка импорта: ' + error.message);
    }
}

// Обработчик Escape для модального окна импорта
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        const importModal = document.getElementById('importModal');
        if (importModal && importModal.classList.contains('active')) {
            if (confirm('Отменить импорт?')) {
                closeImportModal();
            }
        }
    }
});
