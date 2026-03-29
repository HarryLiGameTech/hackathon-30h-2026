package com.e611.trentnavi.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "session")

@Singleton
class SessionStore @Inject constructor(@ApplicationContext private val context: Context) {

    private val sessionIdKey = stringPreferencesKey("session_id")

    suspend fun getOrCreateSessionId(): String {
        val prefs = context.dataStore.data.first()
        val existing = prefs[sessionIdKey]
        if (existing != null) return existing
        val newId = UUID.randomUUID().toString()
        context.dataStore.edit { it[sessionIdKey] = newId }
        return newId
    }

    suspend fun resetSessionId(): String {
        val newId = UUID.randomUUID().toString()
        context.dataStore.edit { it[sessionIdKey] = newId }
        return newId
    }
}
