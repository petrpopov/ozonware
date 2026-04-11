package com.ozonware.repository.lookup

import com.ozonware.entity.lookup.OzonPostingStatus
import org.springframework.data.jpa.repository.JpaRepository

interface OzonPostingStatusRepository : JpaRepository<OzonPostingStatus, String>
