package com.ozonware.service

import com.ozonware.entity.UserSetting
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.UserSettingRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** Persistent key-value settings per user — upserts and retrieves arbitrary JSON-compatible values. */
@Service
class SettingsService(
    private val userSettingRepository: UserSettingRepository
) {
    companion object {
        private val log = LoggerFactory.getLogger(SettingsService::class.java)
    }

    fun getSetting(key: String): Any? {
        val setting = userSettingRepository.findByUserIdAndSettingKey(1, key)
            .orElseThrow { ResourceNotFoundException("Setting not found") }
        return setting.settingValue
    }

    fun saveSetting(key: String, value: Any): UserSetting {
        val existing = userSettingRepository.findByUserIdAndSettingKey(1, key)
        return if (existing.isPresent) {
            val setting = existing.get()
            setting.settingValue = value
            val saved = userSettingRepository.save(setting)
            log.info("[SettingsService] updated key='{}'", key)
            saved
        } else {
            val setting = UserSetting(
                userId = 1,
                settingKey = key,
                settingValue = value
            )
            val saved = userSettingRepository.save(setting)
            log.info("[SettingsService] created key='{}'", key)
            saved
        }
    }
}
