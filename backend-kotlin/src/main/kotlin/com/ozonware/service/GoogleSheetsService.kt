package com.ozonware.service

import com.google.api.services.sheets.v4.Sheets
import com.google.api.services.sheets.v4.model.ValueRange
import com.ozonware.repository.ProductRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

@Service
class GoogleSheetsService(
    private val sheets: Sheets?,
    private val productRepository: ProductRepository
) {

    private val log = LoggerFactory.getLogger(GoogleSheetsService::class.java)

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
        startRow: Int
    ): Map<String, Any> {
        val api = sheets ?: throw IllegalStateException(
            "Google Sheets API not initialized. Check credentials file."
        )

        // Step 1: Read SKU column from the sheet
        val skuRange = "$sheetName!$skuColumn$startRow:$skuColumn"
        val skuData = api.spreadsheets().values().get(spreadsheetId, skuRange).execute()
        val skuValues = skuData.getValues() ?: emptyList()

        // Build map SKU -> row number
        val skuToRow = mutableMapOf<String, Int>()
        skuValues.forEachIndexed { index, row ->
            val sku = row.getOrNull(0)?.toString()?.trim()
            if (!sku.isNullOrEmpty()) {
                skuToRow[sku] = startRow + index
            }
        }
        log.info("Found ${skuToRow.size} SKUs in spreadsheet")

        // Step 2: Build update list
        val products = productRepository.findAll()
        val updates = mutableListOf<ValueRange>()
        var matched = 0
        var notFound = 0

        for (product in products) {
            val sku = product.sku.trim()
            val rowNumber = skuToRow[sku]
            if (rowNumber != null) {
                updates.add(
                    ValueRange()
                        .setRange("$sheetName!$quantityColumn$rowNumber")
                        .setValues(listOf(listOf(product.quantity)))
                )
                matched++
            } else {
                notFound++
            }
        }

        if (updates.isEmpty()) {
            return mapOf("success" to true, "updated" to 0, "matched" to 0, "notFound" to notFound)
        }

        log.info("Updating ${updates.size} rows in spreadsheet...")

        // Step 3: Batch update in chunks of 1000 (API limit)
        val batchSize = 1000
        var totalUpdated = 0

        for (i in updates.indices step batchSize) {
            val batch = updates.subList(i, minOf(i + batchSize, updates.size))
            val body = com.google.api.services.sheets.v4.model.BatchUpdateValuesRequest()
                .setValueInputOption("RAW")
                .setData(batch)
            api.spreadsheets().values().batchUpdate(spreadsheetId, body).execute()
            totalUpdated += batch.size
            log.info("Updated $totalUpdated/${updates.size}")

            // Rate-limit pause between batches
            if (i + batchSize < updates.size) {
                Thread.sleep(100)
            }
        }

        return mapOf(
            "success" to true,
            "updated" to totalUpdated,
            "matched" to matched,
            "notFound" to notFound
        )
    }
}
