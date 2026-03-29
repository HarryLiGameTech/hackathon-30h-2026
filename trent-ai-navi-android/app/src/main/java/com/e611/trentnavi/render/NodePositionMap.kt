package com.e611.trentnavi.render

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class NodePosition(val x: Float, val y: Float)

@Singleton
class NodePositionMap @Inject constructor(@ApplicationContext private val context: Context) {

    @Volatile
    private var cache: Map<String, NodePosition>? = null

    fun getMapping(): Map<String, NodePosition> {
        cache?.let { return it }
        return synchronized(this) {
            cache ?: loadFromAssets().also { cache = it }
        }
    }

    private fun loadFromAssets(): Map<String, NodePosition> {
        return try {
            val json = context.assets.open("node_positions.json").bufferedReader().readText()
            Json.decodeFromString(json)
        } catch (e: Exception) {
            emptyMap()
        }
    }
}
