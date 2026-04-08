package com.ozonware.repository

import com.ozonware.entity.UserSetting
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository
import java.util.*

@Repository
interface UserSettingRepository : JpaRepository<UserSetting, Long> {

    fun findByUserIdAndSettingKey(userId: Int, settingKey: String): Optional<UserSetting>
}
