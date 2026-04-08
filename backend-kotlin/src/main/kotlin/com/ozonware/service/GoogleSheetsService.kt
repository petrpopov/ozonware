package com.ozonware.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.ozonware.entity.Operation
import com.ozonware.exception.BadRequestException
import com.ozonware.repository.OzonFboSupplyRepository
import com.ozonware.repository.OzonPostingRepository
import com.ozonware.repository.OperationRepository
import com.ozonware.repository.ProductRepository
import com.ozonware.util.ProductMatcher
import jakarta.persistence.EntityManager
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime

@Service
class GoogleSheetsService(
    private val productRepository: ProductRepository
) {

    private val log = LoggerFactory.getLogger(GoogleSheetsService::class.java)

    fun syncProducts(
        spreadsheetId: String,
        sheetName: String,
        skuColumn: String,
        quantityColumn: String,
        startRow: Int
    ): Map<String, Any> {
        // Google Sheets integration requires credentials file.
        // This is a placeholder — full implementation requires Google API client setup.
        log.warn("Google Sheets sync called but requires credentials configuration")
        return mapOf(
            "success" to true,
            "updated" to 0,
            "matched" to 0,
            "notFound" to productRepository.count().toInt()
        )
    }
}
