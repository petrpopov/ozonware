package com.ozonware.repository.lookup

import com.ozonware.entity.lookup.OzonSupplyState
import org.springframework.data.jpa.repository.JpaRepository

interface OzonSupplyStateRepository : JpaRepository<OzonSupplyState, String>
