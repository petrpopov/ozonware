import * as state from './modules/state.js';
import { initTheme, toggleTheme } from './modules/theme.js';
import {
    renderProducts,
    loadFieldsOrder,
    renderProductFieldsSettings,
    initSearchHandlers,
    addProductFieldSetting,
    removeProductFieldSetting,
    saveProductFieldsSettings,
    showAddProductModal,
    saveProduct,
    closeModal,
    clearAllFilters,
    editProduct,
    deleteProduct,
    updateColorDisplay,
    updateColorPicker,
    updateImagePreview
} from './modules/products.js';
import {
    startReceipt,
    editReceipt,
    addToReceipt,
    updateReceiptQuantity,
    removeFromReceipt,
    completeReceipt,
    cancelReceipt,
    renderReceiptHistory,
    deleteReceipt,
    setUpdateReports as setReceiptUpdateReports
} from './modules/receipt.js';
import {
    startShipment,
    editShipment,
    addToShipment,
    updateShipmentQuantity,
    removeFromShipment,
    completeShipment,
    cancelShipment,
    renderShipmentHistory,
    deleteShipment,
    setUpdateReports as setShipmentUpdateReports
} from './modules/shipment.js';
import {
    startWriteoff,
    searchWriteoffProduct,
    addWriteoffProduct,
    removeWriteoffItem,
    cancelWriteoff,
    completeWriteoff,
    renderWriteoffHistory,
    renderWriteoffSummary,
    loadWriteoffs,
    deleteWriteoff,
    renderWriteoffItems,
    setUpdateReports as setWriteoffUpdateReports
} from './modules/writeoff.js';
import {
    startInventory,
    processScan,
    completeCurrentBox,
    removeScannedItem,
    incrementInventoryItem,
    decrementInventoryItem,
    removeBox,
    cancelInventory,
    completeInventory,
    switchResultTab,
    applyInventoryResults,
    cancelInventoryResults,
    backToInventory,
    renderInventoryHistory,
    toggleCompletedBoxes,
    setUpdateReports as setInventoryUpdateReports
} from './modules/inventory.js';
import { updateReports } from './modules/reports.js';
import {
    showImportModal,
    closeImportModal,
    processImportFile,
    updatePreview,
    executeImport
} from './modules/import.js';
import {
    loadGoogleSheetsSettings,
    saveGoogleSheetsSettings,
    testGoogleSheetsConnection,
    syncToGoogleSheets
} from './modules/googleSheets.js';
import {
    loadOzonSettings,
    saveOzonSettings,
    testOzonConnection,
    openOzonSyncModal,
    closeOzonSyncModal,
    startOzonSync,
    toggleOzonDay,
    switchOzonTab,
    processAllFbsOrders
} from './modules/ozon.js';
import { downloadBoxLabel, downloadProductLabel } from './modules/labels.js';
import { toggleAccordion } from './modules/ui.js';

const TAB_TITLES = {
    products: 'Товары',
    receipt: 'Приход',
    shipment: 'Отгрузка',
    writeoff: 'Списания',
    inventory: 'Инвентаризация',
    reports: 'Отчеты',
    settings: 'Настройки'
};

function exposeStateGlobals() {
    Object.defineProperties(window, {
        productFieldsSettings: {
            configurable: true,
            get: () => state.productFieldsSettings,
            set: (value) => state.setProductFieldsSettings(value)
        },
        customFieldsTemplate: {
            configurable: true,
            get: () => state.customFieldsTemplate,
            set: (value) => state.setCustomFieldsTemplate(value)
        },
        barcodesTemplate: {
            configurable: true,
            get: () => state.barcodesTemplate,
            set: (value) => state.setBarcodesTemplate(value)
        }
    });
}

function setupCallbacks() {
    setReceiptUpdateReports(updateReports);
    setShipmentUpdateReports(updateReports);
    setWriteoffUpdateReports(updateReports);
    setInventoryUpdateReports(updateReports);
}

function bindGlobals() {
    Object.assign(window, {
        toggleTheme,
        switchTab,
        toggleAccordion,
        renderProductFieldsSettings,
        addProductFieldSetting,
        removeProductFieldSetting,
        saveProductFieldsSettings,
        showAddProductModal,
        saveProduct,
        closeModal,
        clearAllFilters,
        editProduct,
        deleteProduct,
        updateColorDisplay,
        updateColorPicker,
        updateImagePreview,
        startReceipt,
        editReceipt,
        addToReceipt,
        updateReceiptQuantity,
        removeFromReceipt,
        completeReceipt,
        cancelReceipt,
        deleteReceipt,
        startShipment,
        editShipment,
        addToShipment,
        updateShipmentQuantity,
        removeFromShipment,
        completeShipment,
        cancelShipment,
        deleteShipment,
        startWriteoff,
        searchWriteoffProduct,
        addWriteoffProduct,
        removeWriteoffItem,
        completeWriteoff,
        cancelWriteoff,
        deleteWriteoff,
        renderWriteoffItems,
        startInventory,
        processScan,
        completeCurrentBox,
        removeScannedItem,
        incrementInventoryItem,
        decrementInventoryItem,
        removeBox,
        cancelInventory,
        completeInventory,
        switchResultTab,
        applyInventoryResults,
        cancelInventoryResults,
        backToInventory,
        toggleCompletedBoxes,
        showImportModal,
        closeImportModal,
        processImportFile,
        updatePreview,
        executeImport,
        saveGoogleSheetsSettings,
        testGoogleSheetsConnection,
        syncToGoogleSheets,
        saveOzonSettings,
        testOzonConnection,
        openOzonSyncModal,
        closeOzonSyncModal,
        startOzonSync,
        toggleOzonDay,
        switchOzonTab,
        processAllFbsOrders,
        downloadBoxLabel,
        downloadProductLabel
    });
}

function getTabFromPath(pathname) {
    const normalized = pathname.replace(/\/+$/, '') || '/';
    if (normalized === '/') {
        return 'products';
    }

    const tab = normalized.slice(1);
    return TAB_TITLES[tab] ? tab : 'products';
}

function refreshTabData(tabName) {
    if (tabName === 'receipt') {
        renderReceiptHistory();
        return;
    }
    if (tabName === 'shipment') {
        renderShipmentHistory();
        return;
    }
    if (tabName === 'inventory') {
        renderInventoryHistory();
        return;
    }
    if (tabName === 'reports') {
        updateReports();
        return;
    }
    if (tabName === 'settings') {
        renderProductFieldsSettings();
    }
}

function setPageTitle(tabName) {
    document.title = `${TAB_TITLES[tabName] || 'Склад'} - Система складского учета`;
}

function getTabPath(tabName) {
    return tabName === 'products' ? '/' : `/${tabName}`;
}

function switchTab(tabName, updateHistory = true) {
    if (!TAB_TITLES[tabName]) {
        return;
    }

    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const tabButton = document.querySelector(`.tab[data-tab="${tabName}"]`);
    if (tabButton) {
        tabButton.classList.add('active');
    }

    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');
    }

    setPageTitle(tabName);
    refreshTabData(tabName);

    if (!updateHistory) {
        return;
    }

    const nextPath = getTabPath(tabName);
    if (window.location.pathname !== nextPath) {
        window.history.pushState({ tab: tabName }, '', nextPath);
    }
}

async function init() {
    try {
        await state.loadData();
        loadFieldsOrder();
        await loadGoogleSheetsSettings();
        await loadOzonSettings();
        await loadWriteoffs();
        await renderProducts();
        renderReceiptHistory();
        renderShipmentHistory();
        renderInventoryHistory();
        renderWriteoffHistory();
        renderWriteoffSummary();
        await updateReports();
        initSearchHandlers();

        switchTab(getTabFromPath(window.location.pathname), false);
    } catch (error) {
        console.error('Init error:', error);
        alert('Ошибка инициализации: ' + error.message);
    }
}

window.addEventListener('popstate', () => {
    switchTab(getTabFromPath(window.location.pathname), false);
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        exposeStateGlobals();
        setupCallbacks();
        bindGlobals();
        init();
    });
} else {
    initTheme();
    exposeStateGlobals();
    setupCallbacks();
    bindGlobals();
    init();
}
