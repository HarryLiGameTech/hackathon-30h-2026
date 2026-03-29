package com.e611.trentnavi.network

import android.util.Log
import com.e611.trentnavi.BuildConfig
import com.e611.trentnavi.network.models.ChatRequest
import com.e611.trentnavi.network.models.SseEvent
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "ApiClient"

@Singleton
class ApiClient @Inject constructor(
    private val httpClient: okhttp3.OkHttpClient,
) {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private val baseUrl = BuildConfig.BACKEND_BASE_URL
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    fun streamChat(message: String, sessionId: String): Flow<SseEvent> = callbackFlow {
        val url = "$baseUrl/api/v1/chat/single/toolcalls/stream/v2"
        val body = json.encodeToString(ChatRequest(message = message, session_id = sessionId))
        val requestBody = body.toRequestBody(jsonMediaType)

        val request = Request.Builder()
            .url(url)
            .post(requestBody)
            .build()

        val call = httpClient.newCall(request)

        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "onFailure: ${e.message}")
                trySend(SseEvent.Error(message = "Connection error: ${e.message}"))
                close()
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!response.isSuccessful) {
                        Log.e(TAG, "!isSuccessful: ${response.code}")
                        trySend(SseEvent.Error(message = "Server error: ${response.code}"))
                        close()
                        return
                    }
                    val source = response.body!!.source()
                    while (true) {
                        val line = source.readUtf8Line()
                        if (line == null) {
                            Log.d(TAG, "SSE stream ended (null line)")
                            break
                        }
                        if (line.isBlank()) continue
                        Log.d(TAG, "SSE raw: $line")
                        val event = SseParser.parse(line)
                        if (event == null) {
                            Log.w(TAG, "SSE parse returned null for: $line")
                            continue
                        }
                        when (event) {
                            is SseEvent.ContentDelta -> Log.d(TAG, "ContentDelta[${event.content.length}]: ${event.content.take(20)}")
                            is SseEvent.Done -> Log.d(TAG, "Done")
                            is SseEvent.Error -> Log.e(TAG, "Error: ${event.message}")
                            is SseEvent.Cancelled -> Log.w(TAG, "Cancelled: ${event.reason}")
                            else -> Log.d(TAG, "Event: ${event::class.simpleName}")
                        }
                        trySend(event)
                        if (event is SseEvent.Done || event is SseEvent.Error || event is SseEvent.Cancelled) {
                            close()
                            return
                        }
                    }
                    close()
                }
            }
        })

        awaitClose { call.cancel() }
    }

    fun cancelTask(taskId: String) {
        try {
            val url = "$baseUrl/api/v1/chat/task/$taskId"
            val request = Request.Builder()
                .url(url)
                .delete()
                .build()
            httpClient.newCall(request).execute().use { /* best-effort */ }
        } catch (_: Exception) {
            // Best-effort
        }
    }
}
