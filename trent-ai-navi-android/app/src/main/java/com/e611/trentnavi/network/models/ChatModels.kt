package com.e611.trentnavi.network.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class ChatRequest(
    val message: String,
    val session_id: String,
)

@Serializable
data class SseEventRaw(
    val event: String,
    val task_id: String? = null,
    val session_id: String? = null,
    val tool_name: String? = null,
    val arguments: JsonObject? = null,
    val result: String? = null,
    val status: String? = null,
    val content: String? = null,
    val message: String? = null,
    val reason: String? = null,
)

sealed class SseEvent {
    data class TaskCreated(val taskId: String, val sessionId: String) : SseEvent()
    data class ToolCallStart(val toolName: String, val arguments: String) : SseEvent()
    data class ToolCallEnd(val toolName: String, val result: String, val status: String) : SseEvent()
    data class ContentDelta(val content: String) : SseEvent()
    object Done : SseEvent()
    data class Cancelled(val taskId: String, val reason: String) : SseEvent()
    data class Error(val message: String) : SseEvent()
    data class Unknown(val raw: String) : SseEvent()
}
