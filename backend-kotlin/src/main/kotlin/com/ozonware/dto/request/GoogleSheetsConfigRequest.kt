package com.ozonware.dto.request

data class GoogleSheetsConfigRequest(
    val spreadsheetId: String? = null,
    val sheetName: String = "Лист1",
    val skuColumn: String = "A",
    val quantityColumn: String = "B",
    val startRow: Int = 2
)
