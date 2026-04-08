package com.ozonware.entity

import io.hypersistence.utils.hibernate.type.json.JsonType
import jakarta.persistence.*
import org.hibernate.annotations.Type
import java.time.LocalDateTime

@Entity
@Table(name = "user_settings")
data class UserSetting(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long? = null,

    @Column(name = "user_id")
    var userId: Int = 1,

    @Column(name = "setting_key", nullable = false, length = 100)
    var settingKey: String = "",

    @Type(JsonType::class)
    @Column(name = "setting_value", columnDefinition = "jsonb")
    var settingValue: Any? = null,

    @Column(name = "created_at")
    var createdAt: LocalDateTime? = null,

    @Column(name = "updated_at")
    var updatedAt: LocalDateTime? = null
)
