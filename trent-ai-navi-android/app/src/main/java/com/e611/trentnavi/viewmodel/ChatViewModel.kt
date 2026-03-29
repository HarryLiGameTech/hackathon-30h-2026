package com.e611.trentnavi.viewmodel

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.e611.trentnavi.network.models.SseEvent
import com.e611.trentnavi.render.NodePositionMap
import com.e611.trentnavi.render.SketchRouteRenderer
import com.e611.trentnavi.repository.ChatRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject

// ---------- domain models ----------

enum class ToolStatus { RUNNING, SUCCESS, ERROR }

data class ToolStep(
    val id: String,
    val toolName: String,
    val arguments: String,
    val result: String = "",
    val status: ToolStatus = ToolStatus.RUNNING,
    val startMs: Long = System.currentTimeMillis(),
    val elapsedMs: Long = 0L,
    val expanded: Boolean = false,
)

sealed class ChatMessage {
    abstract val timestamp: String

    data class User(val text: String, override val timestamp: String) : ChatMessage()

    data class Assistant(
        val text: String,
        val toolSteps: List<ToolStep> = emptyList(),
        val isStreaming: Boolean = false,
        val thinkingExpanded: Boolean = true,
        override val timestamp: String,
    ) : ChatMessage()

    data class RouteImage(
        val bitmap: Bitmap,
        override val timestamp: String,
    ) : ChatMessage()

    data class Error(val text: String, override val timestamp: String) : ChatMessage()
}

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val inputText: String = "",
    val isStreaming: Boolean = false,
    val showCommandSuggestions: Boolean = false,
    val sessionId: String = "",
)

val SLASH_COMMANDS = listOf(
    "/navigate" to "/navigate [from] [to]",
    "/info" to "/info [node_name]",
    "/query" to "/query [node_name] [attr?]",
)

private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm")

private fun now() = LocalTime.now().format(timeFormatter)

private fun expandSlashCommand(text: String): String {
    val trimmed = text.trim()
    return when {
        trimmed.startsWith("/navigate ") -> {
            val args = trimmed.removePrefix("/navigate ").trim().split(" ", limit = 2)
            val from = args.getOrElse(0) { "" }
            val to = args.getOrElse(1) { "" }
            "How do I get from $from to $to?"
        }
        trimmed.startsWith("/info ") -> {
            val node = trimmed.removePrefix("/info ").trim()
            "Tell me all information about $node"
        }
        trimmed.startsWith("/query ") -> {
            val args = trimmed.removePrefix("/query ").trim().split(" ", limit = 2)
            val node = args.getOrElse(0) { "" }
            val attr = args.getOrElse(1) { "" }
            if (attr.isNotBlank()) "What is the $attr of $node?" else "Tell me all information about $node"
        }
        else -> trimmed
    }
}

// ---------- ViewModel ----------

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val repository: ChatRepository,
    private val nodePositionMap: NodePositionMap,
) : ViewModel() {

    // Node name regex for route parsing
    private val routeCandidateRegex = Regex(
        "(Floor\\d+::[A-Za-z][A-Za-z0-9_]*)|" +
        "(Floor\\d+)|" +
        "([A-Z]{2,}(?:_[A-Z0-9]+)+)|" +
        "([a-z][a-z0-9_]{2,}(?:_[a-z0-9_]+)*)|" +
        "([A-Z][a-z]+(?:[A-Z][a-z]+)+)"
    )

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private var streamJob: Job? = null
    private var streamingFlushJob: Job? = null
    private var currentTaskId: String? = null

    // Index into messages list of the currently-streaming assistant message
    private var assistantMsgIdx: Int = -1

    // Text buffer for client-side streaming simulation
    private var textBuffer = StringBuilder()

    init {
        val welcome = ChatMessage.Assistant(
            text = "Welcome to **Trent Navigator**!\n\nI can help you navigate and find information about Trent Building.\n\nTry these commands:\n- `/navigate [from] [to]` — get directions\n- `/info [location]` — learn about a location\n- `/query [location] [attribute]` — query specific details\n\nOr just ask me anything in natural language.",
            timestamp = now(),
        )
        _uiState.value = _uiState.value.copy(messages = listOf(welcome))

        viewModelScope.launch {
            val sid = repository.getSessionId()
            _uiState.value = _uiState.value.copy(sessionId = sid)
        }
    }

    fun onInputChange(text: String) {
        val show = text.startsWith("/") && !text.contains(" ")
        _uiState.value = _uiState.value.copy(inputText = text, showCommandSuggestions = show)
    }

    fun insertCommand(command: String) {
        _uiState.value = _uiState.value.copy(
            inputText = command,
            showCommandSuggestions = false,
        )
    }

    fun sendMessage() {
        val raw = _uiState.value.inputText.trim()
        if (raw.isBlank() || _uiState.value.isStreaming) return

        val expanded = expandSlashCommand(raw)
        val sessionId = _uiState.value.sessionId

        val userMsg = ChatMessage.User(text = raw, timestamp = now())
        val assistantMsg = ChatMessage.Assistant(text = "", isStreaming = true, timestamp = now())

        val newMessages = _uiState.value.messages + userMsg + assistantMsg
        assistantMsgIdx = newMessages.lastIndex

        _uiState.value = _uiState.value.copy(
            messages = newMessages,
            inputText = "",
            isStreaming = true,
            showCommandSuggestions = false,
        )

        textBuffer.clear()
        startStreamingFlush()
        streamJob = viewModelScope.launch {
            repository.streamChat(expanded, sessionId)
                .catch { e ->
                    updateAssistant { it.copy(isStreaming = false) }
                    appendError("Connection error: ${e.message}")
                    _uiState.value = _uiState.value.copy(isStreaming = false)
                }
                .collect { event -> handleSseEvent(event) }
        }
    }

    fun cancelStream() {
        streamJob?.cancel()
        streamingFlushJob?.cancel()
        val taskId = currentTaskId
        if (taskId != null) {
            viewModelScope.launch { repository.cancelTask(taskId) }
        }
        updateAssistant { it.copy(isStreaming = false) }
        _uiState.value = _uiState.value.copy(isStreaming = false)
        currentTaskId = null
    }

    fun newConversation() {
        streamJob?.cancel()
        streamJob = null
        streamingFlushJob = null
        currentTaskId = null
        textBuffer.clear()
        assistantMsgIdx = -1
        viewModelScope.launch {
            val newSid = repository.resetSession()
            val welcome = ChatMessage.Assistant(
                text = "Started a new conversation. How can I help you?",
                timestamp = now(),
            )
            _uiState.value = ChatUiState(
                messages = listOf(welcome),
                sessionId = newSid,
            )
        }
    }

    fun toggleToolStep(msgIdx: Int, stepIdx: Int) {
        val msgs = _uiState.value.messages.toMutableList()
        val msg = msgs.getOrNull(msgIdx) as? ChatMessage.Assistant ?: return
        val steps = msg.toolSteps.toMutableList()
        val step = steps.getOrNull(stepIdx) ?: return
        steps[stepIdx] = step.copy(expanded = !step.expanded)
        msgs[msgIdx] = msg.copy(toolSteps = steps)
        _uiState.value = _uiState.value.copy(messages = msgs)
    }

    fun toggleThinkingSection(msgIdx: Int) {
        val msgs = _uiState.value.messages.toMutableList()
        val msg = msgs.getOrNull(msgIdx) as? ChatMessage.Assistant ?: return
        msgs[msgIdx] = msg.copy(thinkingExpanded = !msg.thinkingExpanded)
        _uiState.value = _uiState.value.copy(messages = msgs)
    }

    // ---------- private helpers ----------

    private fun startStreamingFlush() {
        streamingFlushJob = viewModelScope.launch {
            delay(50)
            android.util.Log.d("ChatVM", "StreamingFlush started, bufferSize=${textBuffer.length}")
            while (!textBuffer.isEmpty()) {
                val c = textBuffer.first()
                textBuffer.deleteCharAt(0)
                updateAssistant { it.copy(text = it.text + c) }
                val delayMs = when {
                    c in ".!?" -> 60L
                    c in ",;:--" -> 30L
                    else -> 18L
                }
                delay(delayMs)
            }
            android.util.Log.d("ChatVM", "StreamingFlush done")
        }
    }

    private suspend fun handleSseEvent(event: SseEvent) {
        when (event) {
            is SseEvent.TaskCreated -> {
                currentTaskId = event.taskId
            }
            is SseEvent.ToolCallStart -> {
                val step = ToolStep(
                    id = "${event.toolName}_${System.currentTimeMillis()}",
                    toolName = event.toolName,
                    arguments = event.arguments,
                    status = ToolStatus.RUNNING,
                    startMs = System.currentTimeMillis(),
                )
                updateAssistant { msg ->
                    msg.copy(toolSteps = msg.toolSteps + step)
                }
            }
            is SseEvent.ToolCallEnd -> {
                val elapsed = System.currentTimeMillis()
                updateAssistant { msg ->
                    val steps = msg.toolSteps.toMutableList()
                    val idx = steps.indexOfLast { it.toolName == event.toolName && it.status == ToolStatus.RUNNING }
                    if (idx >= 0) {
                        val old = steps[idx]
                        steps[idx] = old.copy(
                            result = event.result,
                            status = if (event.status == "success") ToolStatus.SUCCESS else ToolStatus.ERROR,
                            elapsedMs = elapsed - old.startMs,
                        )
                    }
                    msg.copy(toolSteps = steps)
                }
                // Sketch-route rendering
                if (event.status == "success" &&
                    (event.toolName == "navigate" || event.toolName == "navigate-with-preference")
                ) {
                    renderRouteImage(event.result)
                }
            }
            is SseEvent.ContentDelta -> {
                android.util.Log.d("ChatVM", "ContentDelta[${event.content.length}]: '${event.content.take(30)}'")
                textBuffer.append(event.content)
                android.util.Log.d("ChatVM", "  buffer now size=${textBuffer.length}")
            }
            is SseEvent.Done -> {
                android.util.Log.d("ChatVM", "Done — buffer size=${textBuffer.length}, content='${textBuffer}'")
                streamingFlushJob?.cancel()
                val flushedText = if (textBuffer.isNotEmpty()) {
                    val t = textBuffer.toString()
                    textBuffer.clear()
                    t
                } else ""
                android.util.Log.d("ChatVM", "Done — flushing '$flushedText' (len=${flushedText.length})")
                updateAssistant {
                    android.util.Log.d("ChatVM", "updateAssistant: oldTextLen=${it.text.length}, isStreaming=${it.isStreaming}")
                    it.copy(text = it.text + flushedText, isStreaming = false, thinkingExpanded = false)
                }
                _uiState.value = _uiState.value.copy(isStreaming = false)
                currentTaskId = null
            }
            is SseEvent.Error -> {
                android.util.Log.d("ChatVM", "Error: ${event.message}")
                streamingFlushJob?.cancel()
                val flushedText = if (textBuffer.isNotEmpty()) {
                    val t = textBuffer.toString()
                    textBuffer.clear()
                    t
                } else ""
                updateAssistant {
                    it.copy(text = it.text + flushedText, isStreaming = false)
                }
                appendError(event.message)
                _uiState.value = _uiState.value.copy(isStreaming = false)
                currentTaskId = null
            }
            is SseEvent.Cancelled -> {
                android.util.Log.d("ChatVM", "Cancelled")
                streamingFlushJob?.cancel()
                val flushedText = if (textBuffer.isNotEmpty()) {
                    val t = textBuffer.toString()
                    textBuffer.clear()
                    t
                } else ""
                updateAssistant {
                    it.copy(text = it.text + flushedText, isStreaming = false)
                }
                _uiState.value = _uiState.value.copy(isStreaming = false)
                currentTaskId = null
            }
            is SseEvent.Unknown -> { /* ignore */ }
        }
    }

    private suspend fun renderRouteImage(result: String) {
        // Parse node names from the navigation result
        val known = nodePositionMap.getMapping().keys
        val candidates = routeCandidateRegex.findAll(result).map { it.value }.toSet()
        val nodeNames = mutableListOf<String>()

        // Match structured FloorX::name keys
        for (node in known) {
            if (candidates.contains(node)) nodeNames.add(node)
        }
        // Match bare floor labels
        for (c in candidates) {
            if (c.matches(Regex("Floor\\d+")) && c in known && c !in nodeNames) {
                nodeNames.add(c)
            }
        }
        // Match bare node IDs → resolve to FloorX::name
        for (node in known) {
            if (!node.contains("::")) continue
            val bare = node.substringAfter("::")
            if (bare != node && candidates.contains(bare)) {
                val pattern = Regex("(?<![A-Za-z0-9_])${Regex.escape(bare)}(?![A-Za-z0-9_])")
                if (pattern.containsMatchIn(result) && node !in nodeNames) {
                    nodeNames.add(node)
                }
            }
        }

        android.util.Log.d("ChatVM", "route: allParsed=${nodeNames.size} nodes=${nodeNames.joinToString()}")
        val mapping = nodePositionMap.getMapping()
        val validNodes = nodeNames.filter { mapping.containsKey(it) }
        android.util.Log.d("ChatVM", "route: validNodes=${validNodes.size} list=${validNodes.joinToString()}")
        if (validNodes.size < 2) {
            android.util.Log.w("ChatVM", "route: skipped (need 2+ valid nodes, got ${validNodes.size})")
            return
        }

        val bitmap = withContext(Dispatchers.Default) {
            SketchRouteRenderer.renderRoute(validNodes, mapping)
        }
        if (bitmap != null) {
            val routeMsg = ChatMessage.RouteImage(bitmap = bitmap, timestamp = now())
            // Insert route image BEFORE assistant message at assistantMsgIdx.
            // After insertion the assistant shifts to assistantMsgIdx+1.
            val msgs = _uiState.value.messages.toMutableList()
            msgs.add(assistantMsgIdx, routeMsg)
            assistantMsgIdx += 1  // keep pointing at the assistant message
            _uiState.value = _uiState.value.copy(messages = msgs)
        }
    }

    private fun updateAssistant(transform: (ChatMessage.Assistant) -> ChatMessage.Assistant) {
        val msgs = _uiState.value.messages.toMutableList()
        val idx = assistantMsgIdx
        val msg = msgs.getOrNull(idx) as? ChatMessage.Assistant ?: return
        msgs[idx] = transform(msg)
        _uiState.value = _uiState.value.copy(messages = msgs)
    }

    private fun appendError(text: String) {
        val err = ChatMessage.Error(text = text, timestamp = now())
        _uiState.value = _uiState.value.copy(
            messages = _uiState.value.messages + err,
        )
    }
}
