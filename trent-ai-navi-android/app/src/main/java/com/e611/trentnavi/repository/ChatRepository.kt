package com.e611.trentnavi.repository

import com.e611.trentnavi.data.SessionStore
import com.e611.trentnavi.network.ApiClient
import com.e611.trentnavi.network.models.SseEvent
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChatRepository @Inject constructor(
    private val apiClient: ApiClient,
    private val sessionStore: SessionStore,
) {
    suspend fun getSessionId(): String = sessionStore.getOrCreateSessionId()

    suspend fun resetSession(): String = sessionStore.resetSessionId()

    fun streamChat(message: String, sessionId: String): Flow<SseEvent> =
        apiClient.streamChat(message, sessionId)

    fun cancelTask(taskId: String) = apiClient.cancelTask(taskId)
}
