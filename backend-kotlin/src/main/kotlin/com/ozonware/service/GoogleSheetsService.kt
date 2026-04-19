package com.ozonware.service

import com.google.api.services.sheets.v4.Sheets
import com.google.api.services.sheets.v4.model.BatchUpdateSpreadsheetRequest
import com.google.api.services.sheets.v4.model.BatchUpdateValuesRequest
import com.google.api.services.sheets.v4.model.CellData
import com.google.api.services.sheets.v4.model.CellFormat
import com.google.api.services.sheets.v4.model.Color
import com.google.api.services.sheets.v4.model.CopyPasteRequest
import com.google.api.services.sheets.v4.model.DimensionRange
import com.google.api.services.sheets.v4.model.GridRange
import com.google.api.services.sheets.v4.model.InsertDimensionRequest
import com.google.api.services.sheets.v4.model.MergeCellsRequest
import com.google.api.services.sheets.v4.model.RepeatCellRequest
import com.google.api.services.sheets.v4.model.Request
import com.google.api.services.sheets.v4.model.UnmergeCellsRequest
import com.google.api.services.sheets.v4.model.ValueRange
import com.ozonware.entity.Product
import com.ozonware.repository.ProductFieldRepository
import com.ozonware.repository.ProductFieldValueRepository
import com.ozonware.repository.ProductRepository
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Lazy
import org.springframework.stereotype.Service

/** Google Sheets integration — matches products by SKU, updates quantity, appends missing rows within their category block. */
@Service
class GoogleSheetsService(
    private val sheets: Sheets?,
    private val productRepository: ProductRepository,
    private val productFieldValueRepository: ProductFieldValueRepository,
    private val productFieldRepository: ProductFieldRepository,
    @Lazy private val plannedSupplyService: PlannedSupplyService
) {
    companion object {
        private val log = LoggerFactory.getLogger(GoogleSheetsService::class.java)
        private const val FIELD_HEX = "HEX"
        private const val FIELD_CATEGORY = "Категория"
        private const val FIELD_COLOR_CODE = "Код цвета"
        // Number of columns to include when copying formulas from the row above (covers A–Z)
        private const val FORMULA_COPY_COL_COUNT = 26
    }

    val isInitialized: Boolean get() = sheets != null

    fun testConnection(spreadsheetId: String): Map<String, Any> {
        val api = sheets ?: throw IllegalStateException(
            "Google Sheets API not initialized. Check credentials file."
        )
        val response = api.spreadsheets().get(spreadsheetId)
            .setFields("properties.title,sheets.properties.title")
            .execute()

        return mapOf(
            "success" to true,
            "title" to (response.properties.title ?: ""),
            "sheets" to (response.sheets?.map { it.properties.title } ?: emptyList<String>())
        )
    }

    fun syncProducts(
        spreadsheetId: String,
        sheetName: String,
        skuColumn: String,
        quantityColumn: String,
        startRow: Int,
        categoryColumn: String = "C",
        colorNameColumn: String = "D",
        colorCodeColumn: String = "B",
        swatchColumn: String = "E",
        hexColumn: String = "F",
        deliveryDateColumn: String? = null,
        expectedColumn: String? = null
    ): Map<String, Any> {
        val api = sheets ?: throw IllegalStateException(
            "Google Sheets API not initialized. Check credentials file."
        )
        log.info("[GSheets] syncProducts spreadsheetId={} sheet={} skuCol={} qtyCol={}", spreadsheetId, sheetName, skuColumn, quantityColumn)

        // Step 1: Preload custom field values in 2 queries
        val productFieldMap = loadProductFieldMap()
        log.info("[GSheets] loaded custom fields for {} products", productFieldMap.size)

        // Step 2: Read SKU column from sheet → SKU → row number
        val skuColRange = "$sheetName!${skuColumn}${startRow}:${skuColumn}"
        val skuData = api.spreadsheets().values().get(spreadsheetId, skuColRange).execute()
        val skuToRow = mutableMapOf<String, Int>()
        skuData.getValues()?.forEachIndexed { idx, row ->
            val sku = row.getOrNull(0)?.toString()?.trim()
            if (!sku.isNullOrEmpty()) skuToRow[sku] = startRow + idx
        }
        log.info("[GSheets] read {} SKUs from sheet", skuToRow.size)

        // Step 3: Match products by SKU → updates vs missing
        val products = productRepository.findAll()
        val qtyUpdates = mutableListOf<ValueRange>()
        val missing = mutableListOf<Product>()
        var matched = 0

        for (product in products) {
            val rowNum = skuToRow[product.sku.trim()]
            if (rowNum != null) {
                qtyUpdates.add(
                    ValueRange()
                        .setRange("$sheetName!${quantityColumn}$rowNum")
                        .setValues(listOf(listOf(product.quantity)))
                )
                matched++
            } else {
                missing.add(product)
            }
        }
        log.info("[GSheets] matched={} missing={}", matched, missing.size)

        // Step 4: Batch-update matched rows
        var totalUpdated = 0
        if (qtyUpdates.isNotEmpty()) {
            val batchSize = 1000
            for (i in qtyUpdates.indices step batchSize) {
                val batch = qtyUpdates.subList(i, minOf(i + batchSize, qtyUpdates.size))
                api.spreadsheets().values().batchUpdate(
                    spreadsheetId,
                    BatchUpdateValuesRequest().setValueInputOption("RAW").setData(batch)
                ).execute()
                totalUpdated += batch.size
            }
            log.info("[GSheets] updated {} rows", totalUpdated)
        }

        // Step 4b: Write delivery date and expected quantity columns (planned supplies)
        val openSupplies: Map<String, PlannedSupplyService.OpenSupplyInfo> =
            if (deliveryDateColumn != null && expectedColumn != null)
                plannedSupplyService.findSkusWithOpenSupplies()
            else emptyMap()

        if (deliveryDateColumn != null && expectedColumn != null && skuToRow.isNotEmpty()) {
            val supplyUpdates = mutableListOf<ValueRange>()
            for ((sku, rowNum) in skuToRow) {
                val info = openSupplies[sku]
                val dateValue = info?.expectedDate?.toString() ?: ""
                val expectedValue: Any = if (info != null) info.totalQuantity else ""
                supplyUpdates.add(
                    ValueRange().setRange("$sheetName!${deliveryDateColumn}$rowNum").setValues(listOf(listOf(dateValue)))
                )
                supplyUpdates.add(
                    ValueRange().setRange("$sheetName!${expectedColumn}$rowNum").setValues(listOf(listOf(expectedValue)))
                )
            }
            if (supplyUpdates.isNotEmpty()) {
                val batchSize = 1000
                for (i in supplyUpdates.indices step batchSize) {
                    val batch = supplyUpdates.subList(i, minOf(i + batchSize, supplyUpdates.size))
                    api.spreadsheets().values().batchUpdate(
                        spreadsheetId,
                        BatchUpdateValuesRequest().setValueInputOption("USER_ENTERED").setData(batch)
                    ).execute()
                }
                log.info("[GSheets] wrote delivery date/expected qty for {} SKUs", skuToRow.size)
            }
        }

        // Step 5: Append missing products within their category blocks
        var appended = 0
        if (missing.isNotEmpty()) {
            val sheetId = getSheetId(api, spreadsheetId, sheetName)
            if (sheetId != null) {
                val catColIdx = colLetterToIndex(categoryColumn)
                val categoryMerges = getCategoryMerges(api, spreadsheetId, sheetId, catColIdx)
                val categoryBlockMap = buildCategoryBlockMap(api, spreadsheetId, sheetName, categoryMerges, catColIdx, startRow)
                log.info("[GSheets] category blocks: {}", categoryBlockMap.keys)

                // Group missing by category, process bottom-up to avoid row-shift issues
                val missingByCategory = missing.groupBy { productFieldMap[it.id!!]?.get(FIELD_CATEGORY) ?: "" }
                val sortedCats = missingByCategory.keys.sortedByDescending { cat ->
                    categoryBlockMap[cat]?.first ?: Int.MIN_VALUE
                }

                for (cat in sortedCats) {
                    val prods = missingByCategory[cat] ?: continue
                    val block = categoryBlockMap[cat]

                    appended += if (block != null) {
                        insertIntoBlock(
                            api, spreadsheetId, sheetName, sheetId, prods, productFieldMap, block,
                            skuColumn, colorCodeColumn, colorNameColumn, categoryColumn,
                            swatchColumn, hexColumn, quantityColumn, deliveryDateColumn, expectedColumn, openSupplies
                        )
                    } else {
                        appendAtEnd(
                            api, spreadsheetId, sheetName, sheetId, prods, productFieldMap,
                            skuColumn, colorCodeColumn, colorNameColumn, categoryColumn,
                            swatchColumn, hexColumn, quantityColumn, deliveryDateColumn, expectedColumn, openSupplies
                        )
                    }
                }
            } else {
                log.warn("[GSheets] sheet '{}' not found in spreadsheet", sheetName)
            }
        }

        log.info("[GSheets] done: matched={} updated={} appended={}", matched, totalUpdated, appended)

        return mapOf(
            "success" to true,
            "updated" to totalUpdated,
            "matched" to matched,
            "notFound" to (missing.size - appended),
            "appended" to appended
        )
    }

    // ── Custom field loading ──────────────────────────────────────────────────

    /** Loads all relevant custom field values in 2 DB queries.
     *  Returns: productId → fieldName → valueText */
    private fun loadProductFieldMap(): Map<Long, Map<String, String>> {
        val targetFields = productFieldRepository.findAll()
            .filter { it.name in setOf(FIELD_HEX, FIELD_CATEGORY, FIELD_COLOR_CODE) }
            .associate { it.id!! to it.name }

        if (targetFields.isEmpty()) return emptyMap()

        return productFieldValueRepository.findAllByFieldIdIn(targetFields.keys)
            .filter { it.valueText != null }
            .groupBy { it.productId }
            .mapValues { (_, vals) ->
                vals.mapNotNull { v ->
                    val name = targetFields[v.fieldId] ?: return@mapNotNull null
                    name to (v.valueText ?: "")
                }.toMap()
            }
    }

    // ── Sheet structure ───────────────────────────────────────────────────────

    private fun getSheetId(api: Sheets, spreadsheetId: String, sheetName: String): Int? {
        return api.spreadsheets().get(spreadsheetId)
            .setFields("sheets.properties")
            .execute()
            .sheets?.firstOrNull { it.properties.title == sheetName }
            ?.properties?.sheetId
    }

    /** Returns 0-based (startRowIndex, endRowIndex_exclusive) for each merge in the category column. */
    private fun getCategoryMerges(
        api: Sheets, spreadsheetId: String, sheetId: Int, catColIdx: Int
    ): List<Pair<Int, Int>> {
        val spreadsheet = api.spreadsheets().get(spreadsheetId)
            .setFields("sheets.properties.sheetId,sheets.merges")
            .execute()

        return spreadsheet.sheets
            ?.firstOrNull { it.properties.sheetId == sheetId }
            ?.merges
            ?.filter { m -> m.startColumnIndex == catColIdx && m.endColumnIndex == catColIdx + 1 }
            ?.map { m -> m.startRowIndex to m.endRowIndex }
            ?: emptyList()
    }

    /** Maps category name → (startRowIndex0, endRowIndex0_exclusive).
     *  Handles both merged multi-row blocks AND single-row categories (no merge). */
    private fun buildCategoryBlockMap(
        api: Sheets, spreadsheetId: String, sheetName: String,
        merges: List<Pair<Int, Int>>, catColIdx: Int, startRow: Int
    ): Map<String, Pair<Int, Int>> {
        val catColLetter = colIndexToLetter(catColIdx)
        val result = mutableMapOf<String, Pair<Int, Int>>()

        // 1. Merged multi-row blocks — read category text at the start of each merge
        val mergedRows = mutableSetOf<Int>()
        for ((start0, end0) in merges) {
            val row1 = start0 + 1
            val value = api.spreadsheets().values().get(spreadsheetId, "$sheetName!${catColLetter}$row1").execute()
                .getValues()?.getOrNull(0)?.getOrNull(0)?.toString()?.trim() ?: continue
            if (value.isNotEmpty()) {
                result[value] = start0 to end0
                (start0 until end0).forEach { mergedRows.add(it) }
            }
        }

        // 2. Single-row categories — scan column for non-empty cells not inside any merge
        val colData = api.spreadsheets().values()
            .get(spreadsheetId, "$sheetName!${catColLetter}$startRow:${catColLetter}")
            .execute().getValues() ?: return result

        colData.forEachIndexed { idx, row ->
            val cat = row.getOrNull(0)?.toString()?.trim() ?: return@forEachIndexed
            if (cat.isEmpty()) return@forEachIndexed
            val row0 = startRow - 1 + idx  // 0-based
            if (row0 in mergedRows) return@forEachIndexed  // already covered by a merge block
            if (!result.containsKey(cat)) {
                result[cat] = row0 to (row0 + 1)  // single-row block
            }
        }

        return result
    }

    // ── Row insertion ─────────────────────────────────────────────────────────

    /** Inserts products after an existing category block and extends (or creates) the category merge. */
    private fun insertIntoBlock(
        api: Sheets, spreadsheetId: String, sheetName: String, sheetId: Int,
        products: List<Product>, fieldMap: Map<Long, Map<String, String>>,
        mergeRange: Pair<Int, Int>,
        skuCol: String, codeCol: String, nameCol: String, catCol: String,
        swatchCol: String, hexCol: String, qtyCol: String,
        deliveryDateCol: String? = null, expectedCol: String? = null,
        openSupplies: Map<String, PlannedSupplyService.OpenSupplyInfo> = emptyMap()
    ): Int {
        val n = products.size
        val (mergeStart0, mergeEnd0) = mergeRange
        val catColIdx = colLetterToIndex(catCol)
        val swatchColIdx = colLetterToIndex(swatchCol)
        val isMerged = (mergeEnd0 - mergeStart0) > 1

        // Insert AFTER the block — existing merge is not disturbed, so unmerge range is exact
        val insertAt0 = mergeEnd0
        val requests = mutableListOf<Request>()

        requests.add(Request().setInsertDimension(
            InsertDimensionRequest()
                .setRange(DimensionRange()
                    .setSheetId(sheetId).setDimension("ROWS")
                    .setStartIndex(insertAt0).setEndIndex(insertAt0 + n))
                .setInheritFromBefore(true)
        ))

        // Copy formulas (G, H, etc.) from last row of block into new rows
        if (insertAt0 > 0) {
            requests.add(Request().setCopyPaste(
                CopyPasteRequest()
                    .setSource(GridRange().setSheetId(sheetId)
                        .setStartRowIndex(insertAt0 - 1).setEndRowIndex(insertAt0)
                        .setStartColumnIndex(0).setEndColumnIndex(FORMULA_COPY_COL_COUNT))
                    .setDestination(GridRange().setSheetId(sheetId)
                        .setStartRowIndex(insertAt0).setEndRowIndex(insertAt0 + n)
                        .setStartColumnIndex(0).setEndColumnIndex(FORMULA_COPY_COL_COUNT))
                    .setPasteType("PASTE_FORMULA")
            ))
        }

        // Extend category merge: unmerge old range (if existed), re-merge with new rows
        if (isMerged) {
            requests.add(Request().setUnmergeCells(
                UnmergeCellsRequest().setRange(GridRange().setSheetId(sheetId)
                    .setStartRowIndex(mergeStart0).setEndRowIndex(mergeEnd0)
                    .setStartColumnIndex(catColIdx).setEndColumnIndex(catColIdx + 1))
            ))
        }
        requests.add(Request().setMergeCells(
            MergeCellsRequest()
                .setRange(GridRange().setSheetId(sheetId)
                    .setStartRowIndex(mergeStart0).setEndRowIndex(mergeEnd0 + n)
                    .setStartColumnIndex(catColIdx).setEndColumnIndex(catColIdx + 1))
                .setMergeType("MERGE_ALL")
        ))

        // Vertical alignment TOP for entire extended category range
        requests.add(Request().setRepeatCell(
            RepeatCellRequest()
                .setRange(GridRange().setSheetId(sheetId)
                    .setStartRowIndex(mergeStart0).setEndRowIndex(mergeEnd0 + n)
                    .setStartColumnIndex(catColIdx).setEndColumnIndex(catColIdx + 1))
                .setCell(CellData().setUserEnteredFormat(
                    CellFormat().setVerticalAlignment("TOP")
                ))
                .setFields("userEnteredFormat.verticalAlignment")
        ))

        // Swatch background: set hex color or explicitly clear (don't leave inherited fill)
        products.forEachIndexed { i, product ->
            val hex = fieldMap[product.id!!]?.get(FIELD_HEX) ?: ""
            val bgColor = hexToRgb(hex)
            requests.add(Request().setRepeatCell(
                RepeatCellRequest()
                    .setRange(GridRange().setSheetId(sheetId)
                        .setStartRowIndex(insertAt0 + i).setEndRowIndex(insertAt0 + i + 1)
                        .setStartColumnIndex(swatchColIdx).setEndColumnIndex(swatchColIdx + 1))
                    .setCell(CellData().setUserEnteredFormat(
                        if (bgColor != null) CellFormat().setBackgroundColor(bgColor) else CellFormat()
                    ))
                    .setFields("userEnteredFormat.backgroundColor")
            ))
        }

        api.spreadsheets().batchUpdate(spreadsheetId, BatchUpdateSpreadsheetRequest().setRequests(requests)).execute()

        // Write cell values — one ValueRange per column to avoid overwriting formula columns (G, H, etc.)
        val valueData = products.flatMapIndexed { i, product ->
            buildRowValueRanges(sheetName, product, insertAt0 + i + 1, fieldMap,
                skuCol, codeCol, nameCol, hexCol, qtyCol, deliveryDateCol, expectedCol, openSupplies)
        }
        if (valueData.isNotEmpty()) {
            api.spreadsheets().values().batchUpdate(
                spreadsheetId,
                BatchUpdateValuesRequest().setValueInputOption("USER_ENTERED").setData(valueData)
            ).execute()
        }

        log.info("[GSheets] inserted {} rows after block end row={} category='{}'", n, insertAt0 + 1, products.first().sku)

        return n
    }

    /** Appends products at the end of the sheet (category block not found). */
    private fun appendAtEnd(
        api: Sheets, spreadsheetId: String, sheetName: String, sheetId: Int,
        products: List<Product>, fieldMap: Map<Long, Map<String, String>>,
        skuCol: String, codeCol: String, nameCol: String, catCol: String,
        swatchCol: String, hexCol: String, qtyCol: String,
        deliveryDateCol: String? = null, expectedCol: String? = null,
        openSupplies: Map<String, PlannedSupplyService.OpenSupplyInfo> = emptyMap()
    ): Int {
        val skuColIdx = colLetterToIndex(skuCol)
        val codeColIdx = colLetterToIndex(codeCol)
        val nameColIdx = colLetterToIndex(nameCol)
        val catColIdx = colLetterToIndex(catCol)
        val swatchColIdx = colLetterToIndex(swatchCol)
        val hexColIdx = colLetterToIndex(hexCol)
        val qtyColIdx = colLetterToIndex(qtyCol)
        val deliveryDateColIdx = deliveryDateCol?.let { colLetterToIndex(it) }
        val expectedColIdx = expectedCol?.let { colLetterToIndex(it) }
        val allIdxs = listOfNotNull(skuColIdx, codeColIdx, nameColIdx, catColIdx, swatchColIdx, hexColIdx, qtyColIdx, deliveryDateColIdx, expectedColIdx)
        val maxIdx = allIdxs.max()

        // Group by category so the first product in each category gets the category text
        val seenCategories = mutableSetOf<String>()
        val rows = products.map { product ->
            val fields = fieldMap[product.id!!] ?: emptyMap()
            val category = fields[FIELD_CATEGORY] ?: ""
            val fullCode = fields[FIELD_COLOR_CODE] ?: ""
            val hex = fields[FIELD_HEX] ?: ""
            val colorName = parseColorName(product.name)

            val row = Array<Any>(maxIdx + 1) { "" }
            row[skuColIdx] = product.sku
            row[codeColIdx] = fullCode
            if (category.isNotEmpty() && seenCategories.add(category)) {
                row[catColIdx] = category  // only first row of a new category gets the text
            }
            row[nameColIdx] = colorName
            row[hexColIdx] = hex
            row[qtyColIdx] = product.quantity
            if (deliveryDateColIdx != null && expectedColIdx != null) {
                val info = openSupplies[product.sku.trim()]
                row[deliveryDateColIdx] = info?.expectedDate?.toString() ?: ""
                row[expectedColIdx] = if (info != null) info.totalQuantity else ""
            }
            row.toList()
        }

        val appendRange = "$sheetName!A:${colIndexToLetter(maxIdx)}"
        val result = api.spreadsheets().values()
            .append(spreadsheetId, appendRange, ValueRange().setValues(rows))
            .setValueInputOption("USER_ENTERED")
            .setInsertDataOption("INSERT_ROWS")
            .execute()

        // Swatch background: set hex color or explicitly clear
        val startRow0 = result.updates?.updatedRange?.let { parseStartRow0(it) }
        if (startRow0 != null) {
            val fillRequests = products.mapIndexed { i, product ->
                val hex = fieldMap[product.id!!]?.get(FIELD_HEX) ?: ""
                val bgColor = hexToRgb(hex)
                val rowIdx0 = startRow0 + i
                Request().setRepeatCell(
                    RepeatCellRequest()
                        .setRange(GridRange().setSheetId(sheetId)
                            .setStartRowIndex(rowIdx0).setEndRowIndex(rowIdx0 + 1)
                            .setStartColumnIndex(swatchColIdx).setEndColumnIndex(swatchColIdx + 1))
                        .setCell(CellData().setUserEnteredFormat(
                            if (bgColor != null) CellFormat().setBackgroundColor(bgColor) else CellFormat()
                        ))
                        .setFields("userEnteredFormat.backgroundColor")
                )
            }
            api.spreadsheets().batchUpdate(
                spreadsheetId, BatchUpdateSpreadsheetRequest().setRequests(fillRequests)
            ).execute()
        }

        return products.size
    }

    /** Returns individual ValueRange per column to avoid overwriting formula columns (e.g. G, H) with empty strings. */
    private fun buildRowValueRanges(
        sheetName: String, product: Product, row1Based: Int,
        fieldMap: Map<Long, Map<String, String>>,
        skuCol: String, codeCol: String, nameCol: String,
        hexCol: String, qtyCol: String,
        deliveryDateCol: String? = null, expectedCol: String? = null,
        openSupplies: Map<String, PlannedSupplyService.OpenSupplyInfo> = emptyMap()
    ): List<ValueRange> {
        val fields = fieldMap[product.id!!] ?: emptyMap()
        val fullCode = fields[FIELD_COLOR_CODE] ?: ""
        val hex = fields[FIELD_HEX] ?: ""
        val colorName = parseColorName(product.name)

        val ranges = mutableListOf(
            ValueRange().setRange("$sheetName!$skuCol$row1Based").setValues(listOf(listOf(product.sku))),
            ValueRange().setRange("$sheetName!$codeCol$row1Based").setValues(listOf(listOf(fullCode))),
            ValueRange().setRange("$sheetName!$nameCol$row1Based").setValues(listOf(listOf(colorName))),
            ValueRange().setRange("$sheetName!$hexCol$row1Based").setValues(listOf(listOf(hex))),
            ValueRange().setRange("$sheetName!$qtyCol$row1Based").setValues(listOf(listOf(product.quantity)))
        )
        if (deliveryDateCol != null && expectedCol != null) {
            val info = openSupplies[product.sku.trim()]
            val dateValue = info?.expectedDate?.toString() ?: ""
            val expectedValue: Any = if (info != null) info.totalQuantity else ""
            ranges.add(ValueRange().setRange("$sheetName!$deliveryDateCol$row1Based").setValues(listOf(listOf(dateValue))))
            ranges.add(ValueRange().setRange("$sheetName!$expectedCol$row1Based").setValues(listOf(listOf(expectedValue))))
        }

        return ranges
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    /** "#RRGGBB" → Sheets Color (0.0–1.0 per channel). Blank/invalid hex → null (no fill). */
    private fun hexToRgb(hex: String): Color? {
        if (hex.isBlank()) return null
        val clean = hex.trimStart('#').padEnd(6, '0')
        val r = clean.substring(0, 2).toIntOrNull(16) ?: return null
        val g = clean.substring(2, 4).toIntOrNull(16) ?: return null
        val b = clean.substring(4, 6).toIntOrNull(16) ?: return null

        return Color().setRed(r / 255f).setGreen(g / 255f).setBlue(b / 255f)
    }

    /** "Bambu PLA Matte-Desert Tan-..." → "Desert Tan" */
    private fun parseColorName(name: String): String {
        val afterFirstDash = name.substringAfter('-', "").trim()

        return afterFirstDash.substringBefore('-').trim()
    }

    /** 0-based row index from A1 range like "Sheet1!A5:K5". */
    private fun parseStartRow0(range: String): Int? {
        val n = Regex("""[A-Za-z]+(\d+)""").find(range.substringAfter('!').ifEmpty { range })
            ?.groupValues?.get(1)?.toIntOrNull() ?: return null

        return n - 1
    }

    /** "A" → 0, "B" → 1, "AA" → 26 */
    private fun colLetterToIndex(col: String): Int {
        val upper = col.trim().uppercase()
        var result = 0
        for (ch in upper) result = result * 26 + (ch - 'A' + 1)

        return result - 1
    }

    /** 0 → "A", 25 → "Z", 26 → "AA" */
    private fun colIndexToLetter(index: Int): String {
        var n = index + 1
        val sb = StringBuilder()
        while (n > 0) {
            val rem = (n - 1) % 26
            sb.insert(0, ('A' + rem))
            n = (n - 1) / 26
        }

        return sb.toString()
    }
}
