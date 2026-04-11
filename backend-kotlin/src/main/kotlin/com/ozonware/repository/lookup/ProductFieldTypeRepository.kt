package com.ozonware.repository.lookup

import com.ozonware.entity.lookup.ProductFieldType
import org.springframework.data.jpa.repository.JpaRepository

interface ProductFieldTypeRepository : JpaRepository<ProductFieldType, String>
