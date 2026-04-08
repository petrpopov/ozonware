import { apiCall } from './api.js';
import {
    products, productFieldsSettings, customFieldsTemplate, barcodesTemplate,
    setCustomFieldsTemplate, setBarcodesTemplate, setProductFieldsSettings,
    loadData, getDefaultColumnsOrder
} from './state.js';

// ==================== PRODUCT FIELD SETTINGS ====================

export function renderProductFieldsSettings() {
    const container = document.getElementById('productFieldsList');
    container.innerHTML = productFieldsSettings.map((field, index) => {
        if (field.type === 'select' && !field.options) {
            field.options = [];
        }

        let optionsEditor = '';
        if (field.type === 'select') {
            const optionsList = (field.options || []).map((opt, optIndex) => `
                        <div class="option-item">
                            <input type="text" value="${opt}"
                                onchange="productFieldsSettings[${index}].options[${optIndex}] = this.value">
                            <button class="btn btn-danger btn-icon"
                                onclick="productFieldsSettings[${index}].options.splice(${optIndex}, 1); renderProductFieldsSettings()"
                                title="Удалить">✕</button>
                        </div>
                    `).join('');

            optionsEditor = `
                        <div class="options-editor">
                            <strong>Значения списка:</strong>
                            <div class="options-list">
                                ${optionsList}
                                <button class="btn btn-secondary add-option-btn"
                                    onclick="productFieldsSettings[${index}].options.push(''); renderProductFieldsSettings()">
                                    + Добавить значение
                                </button>
                            </div>
                        </div>
                    `;
        }

        return `
                    <div class="field-setting-item" draggable="true" data-index="${index}">
                        <div class="drag-handle" title="Перетащите для изменения порядка">
                            <span>⋮⋮</span>
                        </div>
                        <input type="text" placeholder="Название поля" value="${field.name}"
                            onchange="productFieldsSettings[${index}].name = this.value">
                        <select onchange="productFieldsSettings[${index}].type = this.value; renderProductFieldsSettings()">
                            <option value="barcode" ${field.type === 'barcode' ? 'selected' : ''}>Штрихкод</option>
                            <option value="text" ${field.type === 'text' ? 'selected' : ''}>Текстовое</option>
                            <option value="number" ${field.type === 'number' ? 'selected' : ''}>Числовое</option>
                            <option value="color" ${field.type === 'color' ? 'selected' : ''}>Цвет</option>
                            <option value="image" ${field.type === 'image' ? 'selected' : ''}>Изображение</option>
                            <option value="select" ${field.type === 'select' ? 'selected' : ''}>Список</option>
                        </select>
                        <label class="checkbox-label">
                            <input type="checkbox" ${field.required ? 'checked' : ''}
                                onchange="productFieldsSettings[${index}].required = this.checked">
                            <span>Обязательное</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" ${field.showInTable !== false ? 'checked' : ''}
                                onchange="productFieldsSettings[${index}].showInTable = this.checked">
                            <span>В таблице</span>
                        </label>
                        <button class="btn btn-danger btn-icon" onclick="removeProductFieldSetting(${index})" title="Удалить">🗑️</button>
                        ${optionsEditor}
                    </div>
                `;
    }).join('');

    initFieldsDragAndDrop();
}

function initFieldsDragAndDrop() {
    const items = document.querySelectorAll('.field-setting-item');
    let draggedItem = null;

    items.forEach(item => {
        item.addEventListener('dragstart', function(e) {
            draggedItem = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            items.forEach(i => i.classList.remove('drag-over'));
        });

        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (draggedItem !== this) {
                this.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', function() {
            this.classList.remove('drag-over');
        });

        item.addEventListener('drop', function(e) {
            e.preventDefault();
            if (draggedItem !== this) {
                const fromIndex = parseInt(draggedItem.dataset.index);
                const toIndex = parseInt(this.dataset.index);
                const item = productFieldsSettings.splice(fromIndex, 1)[0];
                productFieldsSettings.splice(toIndex, 0, item);
                saveFieldsOrder();
                renderProductFieldsSettings();
            }
            this.classList.remove('drag-over');
        });
    });
}

export function saveFieldsOrder() {
    const order = productFieldsSettings.map(f => f.name);
    localStorage.setItem('productFieldsOrder', JSON.stringify(order));
}

export function loadFieldsOrder() {
    try {
        const savedOrder = localStorage.getItem('productFieldsOrder');
        if (savedOrder) {
            const order = JSON.parse(savedOrder);
            const sorted = [];
            order.forEach(name => {
                const field = productFieldsSettings.find(f => f.name === name);
                if (field) sorted.push(field);
            });
            productFieldsSettings.forEach(field => {
                if (!sorted.find(f => f.name === field.name)) {
                    sorted.push(field);
                }
            });
            if (sorted.length > 0) {
                setProductFieldsSettings(sorted);
            }
        }
    } catch (error) {
        console.log('Error loading fields order:', error);
    }
}

export function addProductFieldSetting() {
    productFieldsSettings.push({ name: '', type: 'text', required: false, showInTable: true });
    renderProductFieldsSettings();
}

export function removeProductFieldSetting(index) {
    if (productFieldsSettings.length <= 1) {
        alert('Должно быть хотя бы одно поле!');
        return;
    }
    productFieldsSettings.splice(index, 1);
    renderProductFieldsSettings();
}

export async function saveProductFieldsSettings() {
    if (productFieldsSettings.length === 0) {
        alert('Добавьте хотя бы одно поле!');
        setProductFieldsSettings([{ name: 'Штрихкод', type: 'barcode', required: false, showInTable: true }]);
        renderProductFieldsSettings();
        return;
    }

    try {
        const currentFields = await apiCall('/api/product-fields');
        for (const field of currentFields) {
            await apiCall(`/api/product-fields/${field.id}`, 'DELETE');
        }

        for (let i = 0; i < productFieldsSettings.length; i++) {
            const field = productFieldsSettings[i];
            await apiCall('/api/product-fields', 'POST', {
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

// ==================== PRODUCT CRUD ====================

export function showAddProductModal() {
    document.getElementById('productModalTitle').textContent = 'Добавить товар';
    document.getElementById('productId').value = '';
    document.getElementById('productModal').classList.add('active');
    document.getElementById('productName').value = '';
    document.getElementById('productSKU').value = '';

    setBarcodesTemplate(productFieldsSettings.map(field => ({ type: field.name, value: '' })));

    document.getElementById('productQuantity').value = '0';
    document.getElementById('productDescription').value = '';
    setCustomFieldsTemplate(productFieldsSettings.map(field => {
        let defaultValue = '';
        if (field.type === 'select' && field.required && field.options && field.options.length > 0) {
            defaultValue = field.options[0];
        }
        return {
            name: field.name,
            value: defaultValue,
            type: field.type,
            required: field.required
        };
    }));
    renderCustomFields();
    updateLabelButton();
}

export function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    document.getElementById('productModalTitle').textContent = 'Редактировать товар';
    document.getElementById('productId').value = id;
    document.getElementById('productModal').classList.add('active');
    document.getElementById('productName').value = product.name;
    document.getElementById('productSKU').value = product.sku || '';

    setBarcodesTemplate(productFieldsSettings.map((fieldSetting, index) => {
        let existingBarcode = null;
        if (product.barcodes && product.barcodes[index]) {
            existingBarcode = product.barcodes[index];
        } else if (index === 0 && product.barcode) {
            existingBarcode = { type: fieldSetting.name, value: product.barcode };
        }
        return {
            type: fieldSetting.name,
            value: existingBarcode ? existingBarcode.value : ''
        };
    }));

    document.getElementById('productQuantity').value = product.quantity;
    document.getElementById('productDescription').value = product.description || '';

    setCustomFieldsTemplate(productFieldsSettings.map(fieldSetting => {
        const existingField = product.custom_fields?.find(f => f.name === fieldSetting.name);
        let value = existingField ? existingField.value : '';
        if (!value && fieldSetting.type === 'select' && fieldSetting.required && fieldSetting.options && fieldSetting.options.length > 0) {
            value = fieldSetting.options[0];
        }
        return {
            name: fieldSetting.name,
            value: value,
            type: fieldSetting.type,
            required: fieldSetting.required
        };
    }));
    renderCustomFields();
    updateLabelButton();
}

export function closeModal() {
    document.getElementById('productModal').classList.remove('active');
}

export function renderCustomFields() {
    const container = document.getElementById('customFieldsList');
    if (customFieldsTemplate.length === 0) {
        container.innerHTML = '<p style="color: #6c757d; text-align: center; grid-column: 1 / -1;">Нет дополнительных полей</p>';
        return;
    }

    container.innerHTML = customFieldsTemplate.map((field, index) => {
        const inputType = field.type === 'number' ? 'number' : 'text';
        const requiredMark = field.required ? '<span style="color: red;">*</span>' : '';

        let fieldHTML = '';

        if (field.type === 'select') {
            const fieldSetting = productFieldsSettings.find(f => f.name === field.name);
            const options = fieldSetting?.options || [];
            fieldHTML = `
                        <div class="form-group">
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
        } else if (field.type === 'color') {
            const colorValue = field.value || '#000000';
            fieldHTML = `
                        <div class="form-group">
                            <label>${field.name} ${requiredMark}</label>
                            <div class="color-picker-wrapper">
                                <input type="color"
                                    id="colorPicker-${index}"
                                    value="${colorValue}"
                                    onchange="customFieldsTemplate[${index}].value = this.value; updateColorDisplay(${index})"
                                    ${field.required ? 'required' : ''}>
                                <input type="text"
                                    id="colorText-${index}"
                                    placeholder="#000000"
                                    value="${colorValue}"
                                    maxlength="7"
                                    pattern="^#[0-9A-Fa-f]{6}$"
                                    onchange="customFieldsTemplate[${index}].value = this.value; updateColorPicker(${index})"
                                    ${field.required ? 'required' : ''}>
                                <div class="color-preview" style="background-color: ${colorValue};" id="colorPreview-${index}"></div>
                            </div>
                        </div>
                    `;
        } else if (field.type === 'image') {
            fieldHTML = `
                        <div class="form-group" style="grid-column: 1 / -1;">
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
        } else {
            fieldHTML = `
                        <div class="form-group">
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

export function updateColorDisplay(index) {
    const picker = document.getElementById(`colorPicker-${index}`);
    const text = document.getElementById(`colorText-${index}`);
    const preview = document.getElementById(`colorPreview-${index}`);
    if (picker && text && preview) {
        text.value = picker.value;
        preview.style.backgroundColor = picker.value;
    }
}

export function updateColorPicker(index) {
    const picker = document.getElementById(`colorPicker-${index}`);
    const text = document.getElementById(`colorText-${index}`);
    const preview = document.getElementById(`colorPreview-${index}`);
    if (picker && text && preview) {
        let color = text.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
            picker.value = color;
            preview.style.backgroundColor = color;
        } else if (/^[0-9A-Fa-f]{6}$/.test(color)) {
            color = '#' + color;
            text.value = color;
            picker.value = color;
            preview.style.backgroundColor = color;
        }
    }
}

export function updateImagePreview(index) {
    setTimeout(() => renderCustomFields(), 100);
}

export async function saveProduct() {
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
            await apiCall(`/api/products/${productId}`, 'PUT', productData);
            showAlert('Товар обновлен успешно!', 'success');
        } else {
            await apiCall('/api/products', 'POST', productData);
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

// ==================== DATATABLES RENDERING ====================

let productsDataTable = null;

export async function renderProducts() {
    const visibleFields = productFieldsSettings.filter(field => field.showInTable !== false);

    if (productsDataTable) {
        productsDataTable.destroy();
        productsDataTable = null;
    }

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
                    return `
                        <div style="cursor: pointer;" onclick="editProduct(${row.id})" title="Редактировать товар">
                            <strong style="color: #667eea;">${row.name}</strong>
                            ${row.description ? `<br><small style="color: #6c757d;">${row.description}</small>` : ''}
                        </div>
                    `;
                }
                return row.name;
            }
        },
        {
            data: 'sku',
            title: 'SKU',
            width: '200px',
            render: (data, type, row) => {
                if (type === 'display') {
                    return `<code style="cursor: pointer; color: #667eea; text-decoration: underline; white-space: nowrap;" onclick="editProduct(${row.id})" title="Редактировать товар">${row.sku || '—'}</code>`;
                }
                return row.sku || '';
            }
        }
    ];

    visibleFields.forEach(fieldSetting => {
        let columnWidth = null;
        if (fieldSetting.type === 'color') columnWidth = '100px';
        else if (fieldSetting.type === 'image') columnWidth = '60px';
        else if (fieldSetting.name.toLowerCase().includes('категор')) columnWidth = '120px';
        else if (fieldSetting.name.toLowerCase().includes('код')) columnWidth = '80px';

        columns.push({
            data: null,
            title: fieldSetting.name,
            width: columnWidth,
            render: (data, type, row) => {
                const field = row.custom_fields?.find(f => f.name === fieldSetting.name);
                if (type === 'display') {
                    if (fieldSetting.type === 'image' && field && field.value) {
                        return `<img src="${field.value}" alt="Фото" style="max-width: 40px; max-height: 40px; object-fit: cover; border-radius: 4px;" onerror="this.style.display='none'; this.parentElement.innerHTML='❌'">`;
                    }
                    if (fieldSetting.type === 'color' && field && field.value) {
                        return `<div class="color-cell"><div class="color-square" style="background-color: ${field.value};" title="${field.value}"></div><span>${field.value}</span></div>`;
                    }
                    return field ? field.value : '—';
                }
                return field ? field.value : '';
            }
        });
    });

    columns.push({
        data: 'quantity',
        title: 'Количество',
        width: '100px',
        render: (data, type, row) => {
            if (type === 'display') return `<strong>${row.quantity}</strong>`;
            return row.quantity;
        }
    });

    columns.push({
        data: null,
        title: 'Действия',
        orderable: false,
        searchable: false,
        width: '100px',
        render: (data, type, row) => {
            return `
                <div class="action-buttons">
                    <button class="btn btn-primary btn-icon" onclick="editProduct(${row.id})" title="Редактировать">✏️</button>
                    <button class="btn btn-danger btn-icon" onclick="deleteProduct(${row.id})" title="Удалить">🗑️</button>
                </div>
            `;
        }
    });

    const tableHtml = `<table id="productsDataTable" class="display compact" style="width:100%"></table>`;
    document.getElementById('productsTable').innerHTML = tableHtml;

    productsDataTable = $('#productsDataTable').DataTable({
        data: products,
        columns: columns,
        pageLength: -1,
        lengthMenu: [[-1, 10, 25, 50, 100], ["Все", 10, 25, 50, 100]],
        language: {
            "processing": "Подождите...",
            "search": "Поиск:",
            "lengthMenu": "_MENU_",
            "info": "Записи с _START_ до _END_ из _TOTAL_ записей",
            "infoEmpty": "Записи с 0 до 0 из 0 записей",
            "infoFiltered": "(отфильтровано из _MAX_ записей)",
            "loadingRecords": "Загрузка записей...",
            "zeroRecords": "Записи отсутствуют.",
            "emptyTable": "В таблице отсутствуют данные",
            "paginate": { "first": "Первая", "previous": "Предыдущая", "next": "Следующая", "last": "Последняя" },
            "aria": { "sortAscending": ": активировать для сортировки столбца по возрастанию", "sortDescending": ": активировать для сортировки столбца по убыванию" },
            "select": { "rows": { "_": "Выбрано записей: %d", "1": "Выбрана одна запись" }, "cells": { "1": "1 ячейка выбрана", "_": "Выбрано %d ячеек" }, "columns": { "1": "1 столбец выбран", "_": "Выбрано %d столбцов" } },
            "buttons": { "print": "Печать", "copy": "Копировать", "copyTitle": "Скопировать в буфер обмена", "copySuccess": { "_": "Скопировано %d строк", "1": "Скопирована 1 строка" }, "excel": "Excel", "csv": "CSV" }
        },
        dom: 'Blfrtip',
        buttons: [
            { extend: 'copy', text: '📋 Копировать', className: 'btn btn-secondary' },
            { extend: 'csv', text: '📄 CSV', className: 'btn btn-secondary' },
            { extend: 'excel', text: '📊 Excel', className: 'btn btn-success', filename: 'Товары_склад' },
            { extend: 'print', text: '🖨️ Печать', className: 'btn btn-secondary' }
        ],
        colReorder: true,
        order: [[0, 'desc']],
        autoWidth: false,
        columnDefs: [
            { targets: 0, width: '50px' },
            { targets: 1, width: 'auto' },
            { targets: 2, width: '150px' },
            { targets: -2, width: '80px', className: 'dt-right' },
            { targets: -1, width: '100px', className: 'dt-center', orderable: false }
        ],
        initComplete: function () {
            const api = this.api();

            $('#productsDataTable thead tr').clone(true).addClass('filters').appendTo('#productsDataTable thead');

            api.columns().every(function (index) {
                const column = this;
                const header = $(column.header());

                if (index === api.columns().count() - 1) {
                    $('thead tr.filters th').eq(index).html('');
                    return;
                }

                const input = $('<input type="text" placeholder="" style="width: 100%; padding: 4px; font-size: 12px; border: 1px solid #dee2e6; border-radius: 4px;">')
                    .appendTo($('thead tr.filters th').eq(index).empty())
                    .on('click', function(e) { e.stopPropagation(); })
                    .on('keydown', function(e) {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.stopPropagation(); }
                    })
                    .on('keyup change', function () {
                        if (column.search() !== this.value) {
                            column.search(this.value).draw();
                        }
                    });

                if (header.text().includes('Количество')) {
                    window.quantityColumnIndex = index;
                }
            });

            $.fn.dataTable.ext.search.push(function(settings, data) {
                if (settings.nTable.id !== 'productsDataTable') return true;
                const showZeroQuantity = localStorage.getItem('showZeroQuantity') === 'true';
                if (showZeroQuantity) return true;
                const quantityColIndex = window.quantityColumnIndex;
                if (quantityColIndex !== undefined) {
                    const quantity = parseInt(data[quantityColIndex]) || 0;
                    return quantity > 0;
                }
                return true;
            });

            const toggleHtml = `
                <label style="display: inline-flex; align-items: center; gap: 8px; margin-left: 20px; cursor: pointer;">
                    <input type="checkbox" id="showZeroQuantityToggle" style="width: 18px; height: 18px;">
                    <span style="font-size: 14px;">Показать товары с нулевым остатком</span>
                </label>
            `;
            $('.dataTables_length').append(toggleHtml);

            const savedShowZero = localStorage.getItem('showZeroQuantity') === 'true';
            $('#showZeroQuantityToggle').prop('checked', savedShowZero);

            $('#showZeroQuantityToggle').on('change', function() {
                const showZero = $(this).is(':checked');
                localStorage.setItem('showZeroQuantity', showZero);
                api.draw();
            });

            api.draw();
        }
    });

    productsDataTable.on('column-reorder', function () {
        const columnOrder = productsDataTable.colReorder.order();
        localStorage.setItem('datatables_column_order', JSON.stringify(columnOrder));
    });

    try {
        const savedOrderStr = localStorage.getItem('datatables_column_order');
        if (savedOrderStr) {
            const savedOrder = JSON.parse(savedOrderStr);
            if (Array.isArray(savedOrder) && savedOrder.length === columns.length) {
                productsDataTable.colReorder.order(savedOrder);
            }
        }
    } catch (error) {
        console.log('No saved column order found, using default');
    }

    $('.dataTables_filter').hide();
}

export function initSearchHandlers() {
    const searchInput = $('#searchProduct');
    const clearBtn = $('#clearSearch');

    searchInput.on('input', function() {
        const value = this.value;
        if (productsDataTable) {
            productsDataTable.search(value).draw();
        }
        if (value.length > 0) {
            clearBtn.addClass('visible');
        } else {
            clearBtn.removeClass('visible');
        }
    });

    clearBtn.on('click', function() {
        searchInput.val('');
        if (productsDataTable) {
            productsDataTable.search('').draw();
        }
        clearBtn.removeClass('visible');
        searchInput.focus();
    });
}

export async function deleteProduct(id) {
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

export function clearAllFilters() {
    if (!productsDataTable) return;
    $('thead tr.filters input').val('');
    productsDataTable.columns().search('').draw();
}

function updateLabelButton() {
    const productId = document.getElementById('productId').value;
    const labelBtn = document.getElementById('labelBtn');
    if (productId && labelBtn) {
        labelBtn.style.display = 'inline-block';
    } else if (labelBtn) {
        labelBtn.style.display = 'none';
    }
}

// ==================== ALERTS ====================

export function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    document.querySelector('.content').insertBefore(
        alertDiv,
        document.querySelector('.tab-content.active')
    );
    setTimeout(() => alertDiv.remove(), 3000);
}

export function showModalAlert(message, type) {
    document.getElementById('modalAlert').innerHTML =
        `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => {
        document.getElementById('modalAlert').innerHTML = '';
    }, 3000);
}
