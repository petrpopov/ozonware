package com.ozonware.repository.lookup

import com.ozonware.entity.lookup.OperationChannel
import org.springframework.data.jpa.repository.JpaRepository

interface OperationChannelRepository : JpaRepository<OperationChannel, String>
