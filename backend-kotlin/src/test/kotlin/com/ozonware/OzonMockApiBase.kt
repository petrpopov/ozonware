package com.ozonware

import com.fasterxml.jackson.databind.ObjectMapper
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.Assertions.assertTrue
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Base class for tests that need a mock OZON Seller API.
 *
 * Starts a [MockWebServer] once per JVM run and registers its URL
 * as all four OZON endpoint properties so that [com.ozonware.config.OzonProperties]
 * points to the mock instead of the real API.
 *
 * DB properties are inherited from [IntegrationTestBase].
 *
 * Usage:
 *   1. Call [enqueue] for each expected HTTP response (in call order).
 *   2. Call [runSync] with the async sync method to execute it and wait for completion.
 */
abstract class OzonMockApiBase : IntegrationTestBase() {

    companion object {
        val mockServer: MockWebServer = MockWebServer().also { it.start() }

        @JvmStatic
        @DynamicPropertySource
        fun ozonApiProperties(registry: DynamicPropertyRegistry) {
            val base = "http://localhost:${mockServer.port}"
            registry.add("ozon.api-url")          { "$base/v3/posting/fbs/list" }
            registry.add("ozon.fbo-list-url")      { "$base/v3/supply-order/list" }
            registry.add("ozon.fbo-get-url")       { "$base/v3/supply-order/get" }
            registry.add("ozon.fbo-bundle-url")    { "$base/v1/supply-order/bundle" }
            registry.add("ozon.request-pause-ms")  { "0" }
        }
    }

    @Autowired
    protected lateinit var objectMapper: ObjectMapper

    /** Enqueue one JSON response (200 OK) for the next incoming request. */
    protected fun enqueue(json: String) {
        mockServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(json)
                .addHeader("Content-Type", "application/json")
        )
    }

    /**
     * Executes [action] (which starts an async sync), then blocks until the
     * [SseEmitter] is completed or errored (max 15 s).
     *
     * Note: [SseEmitter.onCompletion] callbacks are only invoked by the servlet
     * container's async infrastructure, which is absent in [WebEnvironment.NONE]
     * tests. Instead we override [SseEmitter.complete] / [SseEmitter.completeWithError]
     * directly so the latch is released as soon as the service calls complete().
     */
    protected fun runSync(action: (SseEmitter) -> Unit) {
        val latch = CountDownLatch(1)
        val emitter = object : SseEmitter(15_000L) {
            override fun complete() {
                try { super.complete() } catch (_: Exception) {}
                latch.countDown()
            }
            override fun completeWithError(ex: Throwable) {
                try { super.completeWithError(ex) } catch (_: Exception) {}
                latch.countDown()
            }
        }
        action(emitter)
        assertTrue(latch.await(15, TimeUnit.SECONDS), "Sync did not complete within 15 seconds")
    }
}
