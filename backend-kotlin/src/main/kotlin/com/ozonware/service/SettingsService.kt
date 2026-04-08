package com.ozonware.service

import com.ozonware.entity.UserSetting
import com.ozonware.exception.ResourceNotFoundException
import com.ozonware.repository.UserSettingRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class SettingsService(
    private val userSettingRepository: UserSettingRepository
) {

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
            userSettingRepository.save(setting)
        } else {
            val setting = UserSetting(
                userId = 1,
                settingKey = key,
                settingValue = value
            )
            userSettingRepository.save(setting)
        }
    }
}
