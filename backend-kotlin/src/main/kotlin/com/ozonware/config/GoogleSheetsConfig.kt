package com.ozonware.config

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.sheets.v4.Sheets
import com.google.auth.http.HttpCredentialsAdapter
import com.google.auth.oauth2.GoogleCredentials
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.io.File

/** Spring configuration — creates and configures the Google Sheets API client bean. */
@Configuration
class GoogleSheetsConfig {
    companion object {
        private val log = LoggerFactory.getLogger(GoogleSheetsConfig::class.java)
    }

    @Value("\${google.service-account-key}")
    private lateinit var serviceAccountKey: String

    @Bean
    fun sheets(): Sheets? {
        return try {
            val keyFile = File(serviceAccountKey)
            if (!keyFile.exists()) {
                log.warn("Google service account key not found: $serviceAccountKey — Google Sheets disabled")
                return null
            }
            val credentials = GoogleCredentials.fromStream(keyFile.inputStream())
                .createScoped("https://www.googleapis.com/auth/spreadsheets")
            val transport = GoogleNetHttpTransport.newTrustedTransport()
            val jsonFactory = GsonFactory.getDefaultInstance()
            val sheets = Sheets.Builder(transport, jsonFactory, HttpCredentialsAdapter(credentials))
                .setApplicationName("OpenWS")
                .build()
            log.info("Google Sheets API initialized from $serviceAccountKey")
            sheets
        } catch (e: Exception) {
            log.error("Failed to initialize Google Sheets API: ${e.message}")
            null
        }
    }
}
