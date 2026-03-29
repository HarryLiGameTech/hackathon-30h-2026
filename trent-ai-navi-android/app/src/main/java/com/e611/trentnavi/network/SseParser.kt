package com.e611.trentnavi.network

import com.e611.trentnavi.network.models.SseEvent
import com.e611.trentnavi.network.models.SseEventRaw
import kotlinx.serialization.json.Json

object SseParser {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    fun parse(line: String): SseEvent? {
        if (!line.startsWith("data:")) return null
        val data = line.removePrefix("data:").trim()
        if (data.isEmpty() || data == "[DONE]") return null

        return try {
            val raw = json.decodeFromString<SseEventRaw>(data)
            when (raw.event) {
                "task_created" -> SseEvent.TaskCreated(
                    taskId = raw.task_id ?: "",
                    sessionId = raw.session_id ?: "",
                )
                "tool_call_start" -> SseEvent.ToolCallStart(
                    toolName = raw.tool_name ?: "",
                    arguments = raw.arguments?.toString() ?: "{}",
                )
                "tool_call_end" -> SseEvent.ToolCallEnd(
                    toolName = raw.tool_name ?: "",
                    result = raw.result ?: "",
                    status = raw.status ?: "success",
                )
                "content_delta" -> SseEvent.ContentDelta(content = raw.content ?: "")
                "done" -> SseEvent.Done
                "cancelled" -> SseEvent.Cancelled(
                    taskId = raw.task_id ?: "",
                    reason = raw.reason ?: "",
                )
                "error" -> SseEvent.Error(message = raw.message ?: "Unknown error")
                else -> SseEvent.Unknown(data)
            }
        } catch (e: Exception) {
            null
        }
    }
}
