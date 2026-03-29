package com.e611.trentnavi.render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Typeface

object SketchRouteRenderer {

    private const val BITMAP_WIDTH = 800
    private const val BITMAP_HEIGHT = 600
    private const val NODE_RADIUS = 16f
    private const val STROKE_WIDTH = 4f
    private const val TEXT_SIZE = 24f
    private const val TEXT_PADDING = 6f

    private val bgColor = Color.parseColor("#1a1d27")
    private val lineColor = Color.parseColor("#3b82f6")
    private val nodeColor = Color.parseColor("#6366f1")
    private val startColor = Color.parseColor("#22c55e")
    private val endColor = Color.parseColor("#f59e0b")
    private val textColor = Color.WHITE

    fun renderRoute(
        nodeNames: List<String>,
        mapping: Map<String, NodePosition>,
    ): Bitmap? {
        val validNodes = nodeNames.filter { mapping.containsKey(it) }
        if (validNodes.size < 2) return null

        val bitmap = Bitmap.createBitmap(BITMAP_WIDTH, BITMAP_HEIGHT, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        // Background
        canvas.drawColor(bgColor)

        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = lineColor
            strokeWidth = STROKE_WIDTH
            style = Paint.Style.STROKE
            pathEffect = DashPathEffect(floatArrayOf(20f, 10f), 0f)
        }
        val nodePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
        }
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = textColor
            textSize = TEXT_SIZE
            typeface = Typeface.DEFAULT
            textAlign = Paint.Align.CENTER
        }

        // Draw lines between consecutive nodes
        for (i in 0 until validNodes.size - 1) {
            val a = mapping[validNodes[i]] ?: continue
            val b = mapping[validNodes[i + 1]] ?: continue
            val ax = a.x * BITMAP_WIDTH
            val ay = a.y * BITMAP_HEIGHT
            val bx = b.x * BITMAP_WIDTH
            val by = b.y * BITMAP_HEIGHT
            canvas.drawLine(ax, ay, bx, by, linePaint)
        }

        // Draw nodes
        for ((index, name) in validNodes.withIndex()) {
            val pos = mapping[name] ?: continue
            val px = pos.x * BITMAP_WIDTH
            val py = pos.y * BITMAP_HEIGHT

            val color = when (index) {
                0 -> startColor
                validNodes.lastIndex -> endColor
                else -> nodeColor
            }
            nodePaint.color = color
            canvas.drawCircle(px, py, NODE_RADIUS, nodePaint)

            val label = if (name.contains("::")) name.substringAfter("::") else name
            canvas.drawText(label, px, py + NODE_RADIUS + TEXT_PADDING + TEXT_SIZE, textPaint)
        }

        return bitmap
    }
}
