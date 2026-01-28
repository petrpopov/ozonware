        // Хранилище данных
        let products = [];
        let operations = [];
        let customFieldsTemplate = [];
        let barcodesTemplate = [];
        let productFieldsSettings = []; // Единые настройки полей для всех товаров
        let columnsOrder = []; // Порядок колонок в таблице

        // Получить порядок колонок по умолчанию
        function getDefaultColumnsOrder() {
            return ['#', 'name', 'sku', ...productFieldsSettings.map(f => f.name), 'quantity', 'actions'];
        }

        // Инициализация
        function init() {
            loadData();
            renderProducts();
            updateSelects();
            updateReports();
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

        function saveProductFieldsSettings() {
            // Фильтруем пустые поля
            productFieldsSettings = productFieldsSettings.filter(f => f.name.trim() !== '');
            
            if (productFieldsSettings.length === 0) {
                alert('Добавьте хотя бы одно поле!');
                productFieldsSettings = [{ name: 'Штрихкод', type: 'barcode', required: false, showInTable: true }];
                renderProductFieldsSettings();
                return;
            }

            saveData();
            renderProducts();
            showAlert('Настройки полей сохранены!', 'success');
        }

        // Работа с localStorage
        function loadData() {
            products = JSON.parse(localStorage.getItem('warehouse_products') || '[]');
            operations = JSON.parse(localStorage.getItem('warehouse_operations') || '[]');
            
            // Дефолтные поля при первом запуске
            const defaultFields = [
                { name: 'Штрихкод', type: 'barcode', required: false, showInTable: true }
            ];
            productFieldsSettings = JSON.parse(localStorage.getItem('warehouse_product_fields') || JSON.stringify(defaultFields));
            
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

        function saveData() {
            localStorage.setItem('warehouse_products', JSON.stringify(products));
            localStorage.setItem('warehouse_operations', JSON.stringify(operations));
            localStorage.setItem('warehouse_product_fields', JSON.stringify(productFieldsSettings));
            localStorage.setItem('warehouse_columns_order', JSON.stringify(columnsOrder));
        }

        // Переключение табов
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
                const existingField = product.customFields?.find(f => f.name === fieldSetting.name);
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

        function saveProduct() {
            const productId = document.getElementById('productId').value;
            const name = document.getElementById('productName').value.trim();
            const sku = document.getElementById('productSKU').value.trim();
            const quantity = parseInt(document.getElementById('productQuantity').value) || 0;
            const description = document.getElementById('productDescription').value.trim();

            // Фильтруем пустые штрихкоды
            const barcodes = barcodesTemplate.filter(b => b.value.trim() !== '');

            if (!name || !sku) {
                showModalAlert('Заполните название и SKU!', 'error');
                return;
            }

            // Проверка уникальности SKU
            const existingProductWithSKU = products.find(p => {
                if (productId && p.id == productId) return false; // Пропускаем текущий товар
                return p.sku === sku;
            });

            if (existingProductWithSKU) {
                showModalAlert(`SKU "${sku}" уже используется в товаре "${existingProductWithSKU.name}"!`, 'error');
                return;
            }

            // Проверка уникальности всех штрихкодов
            for (let barcode of barcodes) {
                const existingProduct = products.find(p => {
                    if (productId && p.id == productId) return false; // Пропускаем текущий товар
                    
                    // Проверяем в новом формате (массив)
                    if (p.barcodes && p.barcodes.some(b => b.value === barcode.value)) {
                        return true;
                    }
                    // Проверяем в старом формате (одиночный штрихкод)
                    if (p.barcode && p.barcode === barcode.value) {
                        return true;
                    }
                    return false;
                });

                if (existingProduct) {
                    showModalAlert(`Штрихкод "${barcode.value}" уже используется в товаре "${existingProduct.name}"!`, 'error');
                    return;
                }
            }

            const customFields = customFieldsTemplate.filter(f => {
                if (f.required && !f.value) return false; // Пропускаем пустые обязательные
                return f.value.trim() !== ''; // Сохраняем только заполненные
            });

            if (productId) {
                // Редактирование существующего товара
                const product = products.find(p => p.id == productId);
                if (product) {
                    product.name = name;
                    product.sku = sku;
                    product.barcodes = barcodes;
                    // Удаляем старое поле barcode если оно есть
                    delete product.barcode;
                    product.quantity = quantity;
                    product.description = description;
                    product.customFields = customFields;
                    
                    saveData();
                    renderProducts();
                    updateSelects();
                    closeModal();
                    showAlert('Товар успешно обновлен!', 'success');
                }
            } else {
                // Добавление нового товара
                const product = {
                    id: Date.now(),
                    name,
                    sku,
                    barcodes,
                    quantity,
                    description,
                    customFields,
                    createdAt: new Date().toISOString()
                };

                products.push(product);
                saveData();
                renderProducts();
                updateSelects();
                closeModal();
                showAlert('Товар успешно добавлен!', 'success');
            }
        }

        function renderProducts() {
            const search = document.getElementById('searchProduct')?.value.toLowerCase() || '';
            const filtered = products.filter(p => {
                // Поиск по названию
                if (p.name.toLowerCase().includes(search)) return true;
                
                // Поиск по SKU
                if (p.sku && p.sku.toLowerCase().includes(search)) return true;
                
                // Поиск по штрихкодам (новый формат)
                if (p.barcodes && p.barcodes.some(b => b.value.toLowerCase().includes(search))) return true;
                
                // Поиск по старому формату штрихкода
                if (p.barcode && p.barcode.toLowerCase().includes(search)) return true;
                
                return false;
            });

            // Обновляем порядок колонок если изменились поля
            const currentColumns = getDefaultColumnsOrder();
            if (columnsOrder.length === 0 || columnsOrder.length !== currentColumns.length) {
                columnsOrder = currentColumns;
            }

            // Видимые кастомные поля
            const visibleFields = productFieldsSettings.filter(field => field.showInTable !== false);
            
            // Функция для получения содержимого колонки
            const getColumnHeader = (col) => {
                if (col === '#') return '<th style="width: 50px;" data-column="#">№</th>';
                if (col === 'name') return '<th data-column="name">Название</th>';
                if (col === 'sku') return '<th data-column="sku">SKU</th>';
                if (col === 'quantity') return '<th data-column="quantity">Количество</th>';
                if (col === 'actions') return '<th data-column="actions">Действия</th>';
                
                // Кастомное поле
                const field = visibleFields.find(f => f.name === col);
                return field ? `<th data-column="${col}">${col}</th>` : '';
            };
            
            const getColumnCell = (col, product, index) => {
                if (col === '#') return `<td style="text-align: center; color: #6c757d;">${index + 1}</td>`;
                if (col === 'name') return `<td><strong>${product.name}</strong><br><small>${product.description || ''}</small></td>`;
                if (col === 'sku') return `<td><code>${product.sku || '—'}</code></td>`;
                if (col === 'quantity') return `<td><strong>${product.quantity}</strong></td>`;
                if (col === 'actions') return `<td>
                    <div class="action-buttons">
                        <button class="btn btn-primary btn-icon" onclick="editProduct(${product.id})" title="Редактировать">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="deleteProduct(${product.id})" title="Удалить">🗑️</button>
                    </div>
                </td>`;
                
                // Кастомное поле
                const fieldSetting = visibleFields.find(f => f.name === col);
                if (fieldSetting) {
                    const field = product.customFields?.find(f => f.name === col);
                    
                    if (fieldSetting.type === 'image' && field && field.value) {
                        return `<td><img src="${field.value}" alt="Фото" onerror="this.style.display='none'; this.parentElement.innerHTML='❌'"></td>`;
                    }
                    
                    return `<td>${field ? field.value : '—'}</td>`;
                }
                
                return '<td></td>';
            };

            const html = `
                <table>
                    <thead>
                        <tr>
                            ${columnsOrder.map(col => getColumnHeader(col)).filter(h => h).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map((product, index) => `
                            <tr>
                                ${columnsOrder.map(col => getColumnCell(col, product, index)).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            document.getElementById('productsTable').innerHTML = filtered.length ? html : '<p>Нет товаров</p>';
            
            // Добавляем drag-and-drop для заголовков
            initColumnDragAndDrop();
        }

        function initColumnDragAndDrop() {
            const headers = document.querySelectorAll('#productsTable th[data-column]');
            let draggedColumn = null;

            headers.forEach(header => {
                header.draggable = true;
                header.style.cursor = 'move';
                header.title = 'Перетащите для изменения порядка';

                header.addEventListener('dragstart', (e) => {
                    draggedColumn = header.getAttribute('data-column');
                    header.style.opacity = '0.5';
                });

                header.addEventListener('dragend', (e) => {
                    header.style.opacity = '1';
                });

                header.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    header.style.background = '#e0e0e0';
                });

                header.addEventListener('dragleave', (e) => {
                    header.style.background = '';
                });

                header.addEventListener('drop', (e) => {
                    e.preventDefault();
                    header.style.background = '';
                    
                    const targetColumn = header.getAttribute('data-column');
                    
                    if (draggedColumn && targetColumn && draggedColumn !== targetColumn) {
                        // Меняем местами колонки в массиве порядка
                        const draggedIndex = columnsOrder.indexOf(draggedColumn);
                        const targetIndex = columnsOrder.indexOf(targetColumn);
                        
                        columnsOrder.splice(draggedIndex, 1);
                        columnsOrder.splice(targetIndex, 0, draggedColumn);
                        
                        saveData();
                        renderProducts();
                    }
                });
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

        function searchProducts() {
            renderProducts();
        }

        function deleteProduct(id) {
            if (confirm('Удалить товар?')) {
                products = products.filter(p => p.id !== id);
                saveData();
                renderProducts();
                updateSelects();
            }
        }

        // Обновление выпадающих списков
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

        function completeReceipt() {
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
            if (!confirm(`${confirmText}\nТоваров: ${Object.keys(receiptData).length}\n\nОстатки будут ${receiptId ? 'пересчитаны' : 'увеличены'}.`)) {
                return;
            }

            const receiptItems = [];
            let totalQuantity = 0;

            if (receiptId) {
                // Редактирование существующего прихода
                const existingOperation = operations.find(op => op.id == receiptId);
                if (existingOperation && existingOperation.items) {
                    // Откатываем старые остатки
                    existingOperation.items.forEach(item => {
                        const product = products.find(p => p.id === item.productId);
                        if (product) {
                            product.quantity -= item.quantity;
                        }
                    });
                }

                // Применяем новые остатки
                Object.values(receiptData).forEach(item => {
                    const product = products.find(p => p.id === item.product.id);
                    if (product) {
                        product.quantity += item.quantity;
                        totalQuantity += item.quantity;
                        receiptItems.push({
                            productId: product.id,
                            productName: product.name,
                            productSKU: product.sku,
                            quantity: item.quantity
                        });
                    }
                });

                // Обновляем операцию
                if (existingOperation) {
                    existingOperation.items = receiptItems;
                    existingOperation.totalQuantity = totalQuantity;
                    existingOperation.note = note;
                    existingOperation.receiptDate = receiptDate;
                }
            } else {
                // Новый приход
                Object.values(receiptData).forEach(item => {
                    const product = products.find(p => p.id === item.product.id);
                    if (product) {
                        product.quantity += item.quantity;
                        totalQuantity += item.quantity;
                        receiptItems.push({
                            productId: product.id,
                            productName: product.name,
                            productSKU: product.sku,
                            quantity: item.quantity
                        });
                    }
                });

                const operation = {
                    id: Date.now(),
                    type: 'receipt',
                    items: receiptItems,
                    totalQuantity: totalQuantity,
                    note,
                    receiptDate,
                    date: new Date().toISOString()
                };

                operations.push(operation);
            }

            saveData();
            
            // СНАЧАЛА закрываем модальное окно и очищаем данные
            const modal = document.getElementById('receiptModal');
            modal.classList.remove('active');
            receiptData = {};
            
            // ПОТОМ обновляем интерфейс
            setTimeout(() => {
                updateSelects();
                renderProducts();
                renderReceiptHistory();
                updateReports();
                const message = receiptId ? 'Приход обновлен!' : `Приход проведен! Товаров: ${receiptItems.length}, общее количество: ${totalQuantity}`;
                showAlert(message, 'success');
            }, 100);
        }

        function renderReceiptHistory() {
            const receiptOps = operations.filter(op => op.type === 'receipt').slice(-10).reverse();
            const html = receiptOps.map(op => {
                // Новый формат (с массивом items)
                if (op.items) {
                    const receiptDateStr = op.receiptDate ? new Date(op.receiptDate).toLocaleDateString('ru-RU') : 'Не указана';
                    return `
                        <div class="operation-item">
                            <h4>Приход от ${receiptDateStr}
                                <span class="badge badge-success">+${op.totalQuantity} шт.</span>
                                <button class="btn btn-primary btn-icon" onclick="editReceipt(${op.id})" 
                                    title="Редактировать" style="margin-left: 10px;">✏️</button>
                                <button class="btn btn-danger btn-icon" onclick="deleteReceipt(${op.id})" 
                                    title="Удалить">🗑️</button>
                            </h4>
                            <div class="details">
                                Создан: ${new Date(op.date).toLocaleString('ru-RU')}<br>
                                Товаров: ${op.items.length}<br>
                                ${op.items.map(item => 
                                    `${item.productName} (SKU: ${item.productSKU}): +${item.quantity}`
                                ).join('<br>')}
                                ${op.note ? `<br><br>Примечание: ${op.note}` : ''}
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

        function deleteReceipt(operationId) {
            const operation = operations.find(op => op.id === operationId);
            if (!operation) return;

            const itemsInfo = operation.items 
                ? `Товаров: ${operation.items.length}, общее количество: ${operation.totalQuantity}`
                : `${operation.productName}: ${operation.quantity} шт.`;

            if (!confirm(`Удалить приход?\n${itemsInfo}\n\nОстатки товаров будут уменьшены.`)) {
                return;
            }

            // Откатываем остатки
            if (operation.items) {
                // Новый формат
                operation.items.forEach(item => {
                    const product = products.find(p => p.id === item.productId);
                    if (product) {
                        product.quantity -= item.quantity;
                        if (product.quantity < 0) product.quantity = 0;
                    }
                });
            } else {
                // Старый формат
                const product = products.find(p => p.id === operation.productId);
                if (product) {
                    product.quantity -= operation.quantity;
                    if (product.quantity < 0) product.quantity = 0;
                }
            }

            // Удаляем операцию
            const index = operations.findIndex(op => op.id === operationId);
            if (index !== -1) {
                operations.splice(index, 1);
            }

            saveData();
            renderProducts();
            renderReceiptHistory();
            updateReports();
            showAlert('Приход удален, остатки откатаны', 'success');
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

        function completeShipment() {
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

            // Проверяем наличие товаров с учетом редактирования
            for (let item of Object.values(shipmentData)) {
                let availableQuantity = item.product.quantity;
                
                // Если редактируем существующую отгрузку, учитываем что старые остатки вернутся
                if (shipmentId) {
                    const existingOperation = operations.find(op => op.id == shipmentId);
                    if (existingOperation && existingOperation.items) {
                        const existingItem = existingOperation.items.find(i => i.productId === item.product.id);
                        if (existingItem) {
                            availableQuantity += existingItem.quantity; // Возвращаем старое количество
                        }
                    }
                }
                
                if (availableQuantity < item.quantity) {
                    alert(`Недостаточно товара "${item.product.name}" на складе!\nДоступно: ${availableQuantity}, требуется: ${item.quantity}`);
                    return;
                }
            }
            
            const confirmText = shipmentId ? 'Сохранить изменения в отгрузке?' : 'Провести отгрузку?';
            if (!confirm(`${confirmText}\nТоваров: ${Object.keys(shipmentData).length}\n\nОстатки будут ${shipmentId ? 'пересчитаны' : 'уменьшены'}.`)) {
                return;
            }

            const shipmentItems = [];
            let totalQuantity = 0;

            if (shipmentId) {
                // Редактирование существующей отгрузки
                const existingOperation = operations.find(op => op.id == shipmentId);
                if (existingOperation && existingOperation.items) {
                    // Откатываем старые остатки
                    existingOperation.items.forEach(item => {
                        const product = products.find(p => p.id === item.productId);
                        if (product) {
                            product.quantity += item.quantity;
                        }
                    });
                }

                // Применяем новые остатки
                Object.values(shipmentData).forEach(item => {
                    const product = products.find(p => p.id === item.product.id);
                    if (product) {
                        product.quantity -= item.quantity;
                        totalQuantity += item.quantity;
                        shipmentItems.push({
                            productId: product.id,
                            productName: product.name,
                            productSKU: product.sku,
                            quantity: item.quantity
                        });
                    }
                });

                // Обновляем операцию
                if (existingOperation) {
                    existingOperation.items = shipmentItems;
                    existingOperation.totalQuantity = totalQuantity;
                    existingOperation.note = note;
                    existingOperation.shipmentDate = shipmentDate;
                }
            } else {
                // Новая отгрузка
                Object.values(shipmentData).forEach(item => {
                    const product = products.find(p => p.id === item.product.id);
                    if (product) {
                        product.quantity -= item.quantity;
                        totalQuantity += item.quantity;
                        shipmentItems.push({
                            productId: product.id,
                            productName: product.name,
                            productSKU: product.sku,
                            quantity: item.quantity
                        });
                    }
                });

                const operation = {
                    id: Date.now(),
                    type: 'shipment',
                    items: shipmentItems,
                    totalQuantity: totalQuantity,
                    note,
                    shipmentDate,
                    date: new Date().toISOString()
                };

                operations.push(operation);
            }

            saveData();
            
            // Закрываем модальное окно
            const modal = document.getElementById('shipmentModal');
            modal.classList.remove('active');
            shipmentData = {};
            
            // Обновляем интерфейс
            setTimeout(() => {
                updateSelects();
                renderProducts();
                renderShipmentHistory();
                updateReports();
                const message = shipmentId ? 'Отгрузка обновлена!' : `Отгрузка проведена! Товаров: ${shipmentItems.length}, общее количество: ${totalQuantity}`;
                showAlert(message, 'success');
            }, 100);
        }

        function renderShipmentHistory() {
            const shipmentOps = operations.filter(op => op.type === 'shipment').slice(-10).reverse();
            const html = shipmentOps.map(op => {
                // Новый формат (с массивом items)
                if (op.items) {
                    const shipmentDateStr = op.shipmentDate ? new Date(op.shipmentDate).toLocaleDateString('ru-RU') : 'Не указана';
                    return `
                        <div class="operation-item">
                            <h4>Отгрузка от ${shipmentDateStr}
                                <span class="badge badge-danger">-${op.totalQuantity} шт.</span>
                                <button class="btn btn-primary btn-icon" onclick="editShipment(${op.id})" 
                                    title="Редактировать" style="margin-left: 10px;">✏️</button>
                                <button class="btn btn-danger btn-icon" onclick="deleteShipment(${op.id})" 
                                    title="Удалить">🗑️</button>
                            </h4>
                            <div class="details">
                                Создана: ${new Date(op.date).toLocaleString('ru-RU')}<br>
                                Товаров: ${op.items.length}<br>
                                ${op.items.map(item => 
                                    `${item.productName} (SKU: ${item.productSKU}): -${item.quantity}`
                                ).join('<br>')}
                                ${op.note ? `<br><br>Примечание: ${op.note}` : ''}
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

        function deleteShipment(operationId) {
            const operation = operations.find(op => op.id === operationId);
            if (!operation) return;

            const itemsInfo = operation.items 
                ? `Товаров: ${operation.items.length}, общее количество: ${operation.totalQuantity}`
                : `${operation.productName}: ${operation.quantity} шт.`;

            if (!confirm(`Удалить отгрузку?\n${itemsInfo}\n\nОстатки товаров будут увеличены (отгрузка отменится).`)) {
                return;
            }

            // Откатываем остатки (возвращаем товары на склад)
            if (operation.items) {
                // Новый формат
                operation.items.forEach(item => {
                    const product = products.find(p => p.id === item.productId);
                    if (product) {
                        product.quantity += item.quantity;
                    }
                });
            } else {
                // Старый формат
                const product = products.find(p => p.id === operation.productId);
                if (product) {
                    product.quantity += operation.quantity;
                }
            }

            // Удаляем операцию
            const index = operations.findIndex(op => op.id === operationId);
            if (index !== -1) {
                operations.splice(index, 1);
            }

            saveData();
            renderProducts();
            renderShipmentHistory();
            updateReports();
            showAlert('Отгрузка удалена, товары возвращены на склад', 'success');
        }

        // Инвентаризация
        let inventoryData = {};

        function startInventory() {
            inventoryData = {};
            document.getElementById('inventoryModal').classList.add('active');
            document.getElementById('scanInput').focus();
            updateScannedItems();
            
            // Устанавливаем обработчик для поля сканирования
            const scanInput = document.getElementById('scanInput');
            scanInput.value = '';
            
            // Убираем старые обработчики
            scanInput.replaceWith(scanInput.cloneNode(true));
            const newScanInput = document.getElementById('scanInput');
            
            newScanInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    processScan();
                }
            });

            // Автофокус при клике в любое место модального окна
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

            // Искать по ВСЕМ полям типа "barcode":
            const product = products.find(p => {
                if (!p.customFields) return false;

                return p.customFields.some(field => {
                    // Найти настройку этого поля
                    const fieldSetting = productFieldsSettings.find(fs => fs.name === field.name);
                    // Проверить что это штрихкод И значение совпадает
                    return fieldSetting?.type === 'barcode' && field.value === barcode;
                });
            });
            
            if (product) {
                // Увеличиваем счетчик
                if (!inventoryData[product.id]) {
                    inventoryData[product.id] = {
                        product: product,
                        count: 0
                    };
                }
                inventoryData[product.id].count++;
                
                // Показываем успешное сканирование
                showScanAlert(`✅ ${product.name} (+1)`, 'success');
                updateScannedItems();
                
                // Анимация счетчика
                const countElement = document.querySelector(`[data-product-id="${product.id}"] .scanned-item-count`);
                if (countElement) {
                    countElement.classList.add('pulse');
                    setTimeout(() => countElement.classList.remove('pulse'), 300);
                }
            } else {
                showScanAlert(`❌ Товар с штрихкодом "${barcode}" не найден`, 'error');
            }
            
            // Очищаем поле и возвращаем фокус
            scanInput.value = '';
            scanInput.focus();
        }

        function showScanAlert(message, type) {
            const alertDiv = document.getElementById('scanAlert');
            alertDiv.innerHTML = `<div class="scan-${type}">${message}</div>`;
            
            setTimeout(() => {
                alertDiv.innerHTML = '';
            }, 2000);
        }

        function updateScannedItems() {
            const container = document.getElementById('scannedItems');
            const countElement = document.getElementById('scannedCount');
            
            const items = Object.values(inventoryData);
            countElement.textContent = items.length;
            
            if (items.length === 0) {
                container.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">Начните сканирование товаров</p>';
                return;
            }
            
            // Сортируем по имени
            items.sort((a, b) => a.product.name.localeCompare(b.product.name));
            
            container.innerHTML = items.map(item => {
                let barcodesDisplay = '';
                if (item.product.barcodes && item.product.barcodes.length > 0) {
                    barcodesDisplay = item.product.barcodes.map(b => `${b.type}: ${b.value}`).join(', ');
                } else if (item.product.barcode) {
                    barcodesDisplay = item.product.barcode;
                }
                
                return `
                <div class="scanned-item" data-product-id="${item.product.id}">
                    <div>
                        <div class="scanned-item-name">${item.product.name}</div>
                        <div class="scanned-item-barcode">Штрихкоды: ${barcodesDisplay}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="text-align: right;">
                            <small style="color: #6c757d;">Учет: ${item.product.quantity}</small>
                        </div>
                        <div class="scanned-item-count">${item.count}</div>
                        <button class="btn btn-danger btn-icon" onclick="removeScannedItem(${item.product.id})" 
                            title="Удалить">🗑️</button>
                    </div>
                </div>
            `}).join('');
        }

        function removeScannedItem(productId) {
            delete inventoryData[productId];
            updateScannedItems();
        }

        function cancelInventory() {
            if (Object.keys(inventoryData).length > 0) {
                if (!confirm('Отменить инвентаризацию? Все отсканированные данные будут потеряны.')) {
                    return;
                }
            }
            document.getElementById('inventoryModal').classList.remove('active');
            inventoryData = {};
        }

        function completeInventory() {
            if (Object.keys(inventoryData).length === 0) {
                alert('Не отсканировано ни одного товара!');
                return;
            }

            if (!confirm(`Применить результаты инвентаризации?\nОтсканировано позиций: ${Object.keys(inventoryData).length}\n\nОстатки товаров будут обновлены.`)) {
                return;
            }

            const differences = [];
            
            // Обновляем остатки для отсканированных товаров
            Object.values(inventoryData).forEach(item => {
                const product = products.find(p => p.id === item.product.id);
                if (product) {
                    const diff = item.count - product.quantity;
                    
                    if (diff !== 0) {
                        differences.push({
                            product: product.name,
                            expected: product.quantity,
                            actual: item.count,
                            diff: diff
                        });
                    }
                    
                    product.quantity = item.count;
                }
            });

            // Товары, которые не были отсканированы, обнуляем (если нужно)
            // Можно раскомментировать следующий блок, если хотите обнулять неотсканированные товары:
            /*
            products.forEach(product => {
                if (!inventoryData[product.id]) {
                    if (product.quantity > 0) {
                        differences.push({
                            product: product.name,
                            expected: product.quantity,
                            actual: 0,
                            diff: -product.quantity
                        });
                        product.quantity = 0;
                    }
                }
            });
            */

            const operation = {
                id: Date.now(),
                type: 'inventory',
                scannedItems: Object.keys(inventoryData).length,
                differences,
                date: new Date().toISOString()
            };

            operations.push(operation);
            saveData();
            
            // Закрываем модальное окно и очищаем данные
            document.getElementById('inventoryModal').classList.remove('active');
            inventoryData = {};
            
            // Обновляем все зависимые элементы
            updateSelects();
            renderProducts();
            renderInventoryHistory();
            updateReports();
            
            // Показываем уведомление
            setTimeout(() => {
                showAlert(`Инвентаризация завершена! Обновлено позиций: ${differences.length}`, 'success');
            }, 100);
        }

        function renderInventoryHistory() {
            const invOps = operations.filter(op => op.type === 'inventory').slice(-5).reverse();
            const html = invOps.map(op => `
                <div class="operation-item">
                    <h4>Инвентаризация от ${new Date(op.date).toLocaleString('ru-RU')}</h4>
                    <div class="details">
                        Отсканировано позиций: <strong>${op.scannedItems || 0}</strong><br>
                        Расхождений: <strong>${op.differences.length}</strong>
                        ${op.differences.length > 0 ? `
                            <div style="margin-top: 10px;">
                                ${op.differences.map(d => `
                                    <div style="margin-top: 5px;">
                                        ${d.product}: ${d.expected} → ${d.actual} 
                                        <span class="badge ${d.diff > 0 ? 'badge-success' : 'badge-danger'}">
                                            ${d.diff > 0 ? '+' : ''}${d.diff}
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `).join('');

            document.getElementById('inventoryHistory').innerHTML = 
                invOps.length ? '<h3>История инвентаризаций</h3>' + html : '';
        }

        // Отчеты
        function updateReports() {
            const totalProducts = products.length;
            const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);
            const totalReceipts = operations.filter(op => op.type === 'receipt').length;
            const totalShipments = operations.filter(op => op.type === 'shipment').length;

            document.getElementById('statsCards').innerHTML = `
                <div class="stat-card">
                    <h3>Всего товаров</h3>
                    <div class="value">${totalProducts}</div>
                </div>
                <div class="stat-card">
                    <h3>Общее количество</h3>
                    <div class="value">${totalQuantity}</div>
                </div>
                <div class="stat-card">
                    <h3>Операций прихода</h3>
                    <div class="value">${totalReceipts}</div>
                </div>
                <div class="stat-card">
                    <h3>Операций отгрузки</h3>
                    <div class="value">${totalShipments}</div>
                </div>
            `;

            const recentOps = operations.slice(-20).reverse();
            const html = recentOps.map(op => {
                let badge = '';
                let text = '';
                
                if (op.type === 'receipt') {
                    // Новый формат (с массивом items)
                    if (op.items) {
                        const dateStr = op.receiptDate ? new Date(op.receiptDate).toLocaleDateString('ru-RU') : '';
                        badge = `<span class="badge badge-success">Приход +${op.totalQuantity}</span>`;
                        text = `${dateStr ? dateStr + ' - ' : ''}Товаров: ${op.items.length}`;
                    } else {
                        // Старый формат (одиночный товар)
                        badge = `<span class="badge badge-success">Приход +${op.quantity}</span>`;
                        text = op.productName;
                    }
                } else if (op.type === 'shipment') {
                    // Новый формат (с массивом items)
                    if (op.items) {
                        const dateStr = op.shipmentDate ? new Date(op.shipmentDate).toLocaleDateString('ru-RU') : '';
                        badge = `<span class="badge badge-danger">Отгрузка -${op.totalQuantity}</span>`;
                        text = `${dateStr ? dateStr + ' - ' : ''}Товаров: ${op.items.length}`;
                    } else {
                        // Старый формат (одиночный товар)
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
                            ${new Date(op.date).toLocaleString('ru-RU')}
                            ${op.note ? `<br>Примечание: ${op.note}` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            document.getElementById('operationsHistory').innerHTML = html || '<p>Операций пока нет</p>';
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
        init();
