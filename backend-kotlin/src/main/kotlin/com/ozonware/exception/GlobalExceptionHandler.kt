package com.ozonware.exception

import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import jakarta.servlet.http.HttpServletRequest

/** Global Spring MVC exception handler — maps domain exceptions to HTTP error responses. */
@RestControllerAdvice
class GlobalExceptionHandler {
    companion object {
        private val log = LoggerFactory.getLogger(GlobalExceptionHandler::class.java)
    }

    @ExceptionHandler(ResourceNotFoundException::class)
    fun handleNotFound(ex: ResourceNotFoundException): ResponseEntity<Map<String, String>> {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("error" to ex.message!!))
    }

    @ExceptionHandler(ConflictException::class)
    fun handleConflict(ex: ConflictException): ResponseEntity<Map<String, Any>> {
        val body = mutableMapOf<String, Any>("error" to ex.message!!)
        ex.operationsCount?.let { body["operations_count"] = it }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body)
    }

    @ExceptionHandler(BadRequestException::class)
    fun handleBadRequest(ex: BadRequestException): ResponseEntity<Map<String, String>> {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("error" to ex.message!!))
    }

    @ExceptionHandler(DataIntegrityViolationException::class)
    fun handleDataIntegrity(ex: DataIntegrityViolationException): ResponseEntity<Map<String, String>> {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("error" to "Data integrity violation"))
    }

    @ExceptionHandler(Exception::class)
    fun handleGeneric(ex: Exception, request: HttpServletRequest): ResponseEntity<Map<String, String>>? {
        val accept = request.getHeader("Accept") ?: ""
        if (accept.contains(MediaType.TEXT_EVENT_STREAM_VALUE)) {
            log.error("Exception in SSE endpoint [${request.requestURI}]", ex)
            return null
        }
        log.error("Unhandled exception [${request.requestURI}]", ex)
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(mapOf("error" to (ex.message ?: "Internal server error")))
    }
}

class ResourceNotFoundException(message: String) : RuntimeException(message)
class ConflictException(message: String, val operationsCount: Int? = null) : RuntimeException(message)
class BadRequestException(message: String) : RuntimeException(message)
