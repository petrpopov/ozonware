package com.ozonware.service

import com.ozonware.IntegrationTestBase
import com.ozonware.entity.UserSetting
import com.ozonware.repository.UserSettingRepository
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.annotation.Transactional

/**
 * Regression test for user_settings UNIQUE constraint fix (V6).
 * After V6, only UNIQUE(user_id, setting_key) should exist — not UNIQUE(setting_key).
 */
@Transactional
class UserSettingsIntegrationTest : IntegrationTestBase() {

    @Autowired lateinit var userSettingRepository: UserSettingRepository
    @Autowired lateinit var entityManager: EntityManager

    private fun flush() {
        entityManager.flush()
        entityManager.clear()
    }

    @Test
    fun saveAndLoadSettingByKey() {
        val setting = userSettingRepository.save(
            UserSetting(
                userId = 1,
                settingKey = "test_config_key",
                settingValue = mapOf("theme" to "dark", "lang" to "ru")
            )
        )
        flush()

        val found = userSettingRepository.findByUserIdAndSettingKey(1, "test_config_key")

        assertThat(found).isPresent
        assertThat(found.get().id).isEqualTo(setting.id)

        @Suppress("UNCHECKED_CAST")
        val value = found.get().settingValue as Map<String, String>
        assertThat(value["theme"]).isEqualTo("dark")
        assertThat(value["lang"]).isEqualTo("ru")
    }

    @Test
    fun updateExistingSettingByKey() {
        userSettingRepository.save(
            UserSetting(userId = 1, settingKey = "update_me", settingValue = mapOf("v" to "initial"))
        )
        flush()

        val existing = userSettingRepository.findByUserIdAndSettingKey(1, "update_me").get()
        existing.settingValue = mapOf("v" to "updated")
        userSettingRepository.save(existing)
        flush()

        val found = userSettingRepository.findByUserIdAndSettingKey(1, "update_me")
        assertThat(found).isPresent

        @Suppress("UNCHECKED_CAST")
        val value = found.get().settingValue as Map<String, String>
        assertThat(value["v"]).isEqualTo("updated")
    }
}
