package com.ozonware.dto.request

data class GoogleSheetsConfigRequest(
    val spreadsheetId: String? = null,
    val sheetName: String = "Лист1",
    val skuColumn: String = "A",       // Артикул
    val quantityColumn: String = "I",  // Остаток
    val startRow: Int = 2,
    val categoryColumn: String = "C",
    val colorNameColumn: String = "D",
    val colorCodeColumn: String = "B",
    val swatchColumn: String = "E",
    val hexColumn: String = "F",
    val deliveryDateColumn: String? = null,
    val expectedColumn: String? = null
)
