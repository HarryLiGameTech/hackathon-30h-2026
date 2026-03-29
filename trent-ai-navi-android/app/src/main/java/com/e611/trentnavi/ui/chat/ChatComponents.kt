package com.e611.trentnavi.ui.chat

import android.widget.TextView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.e611.trentnavi.ui.theme.AssistantBubble
import com.e611.trentnavi.ui.theme.OnSurfaceLight
import com.e611.trentnavi.ui.theme.OnSurfaceMuted
import com.e611.trentnavi.ui.theme.ToolError
import com.e611.trentnavi.ui.theme.ToolRunning
import com.e611.trentnavi.ui.theme.ToolSuccess
import com.e611.trentnavi.ui.theme.UserBubble
import com.e611.trentnavi.viewmodel.ChatMessage
import com.e611.trentnavi.viewmodel.ToolStatus
import com.e611.trentnavi.viewmodel.ToolStep
import io.noties.markwon.Markwon
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin

@Composable
fun UserMessageBubble(msg: ChatMessage.User) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
    ) {
        Column(horizontalAlignment = Alignment.End) {
            Box(
                modifier = Modifier
                    .widthIn(max = 300.dp)
                    .clip(RoundedCornerShape(16.dp, 4.dp, 16.dp, 16.dp))
                    .background(UserBubble)
                    .padding(12.dp, 8.dp),
            ) {
                Text(
                    text = msg.text,
                    color = OnSurfaceLight,
                    fontSize = 15.sp,
                )
            }
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = msg.timestamp,
                color = OnSurfaceMuted,
                fontSize = 11.sp,
            )
        }
    }
}

@Composable
fun AssistantMessageBubble(
    msg: ChatMessage.Assistant,
    msgIdx: Int,
    onToggleStep: (Int) -> Unit,
    onToggleThinking: () -> Unit,
) {
    val context = LocalContext.current
    val markwon = remember(context) {
        Markwon.builder(context)
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(TablePlugin.create(context))
            .build()
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
    ) {
        Column(modifier = Modifier.widthIn(max = 320.dp)) {
            // Thinking section (tool steps)
            if (msg.toolSteps.isNotEmpty()) {
                ThinkingSection(
                    toolSteps = msg.toolSteps,
                    isExpanded = msg.thinkingExpanded,
                    onToggle = onToggleThinking,
                    onToggleStep = onToggleStep,
                )
                Spacer(modifier = Modifier.height(4.dp))
            }

            // Text bubble
            if (msg.text.isNotBlank() || msg.isStreaming) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp, 16.dp, 16.dp, 16.dp))
                        .background(AssistantBubble)
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f), RoundedCornerShape(4.dp, 16.dp, 16.dp, 16.dp))
                        .padding(12.dp, 8.dp),
                ) {
                    if (msg.text.isBlank() && msg.isStreaming) {
                        TypingIndicator()
                    } else {
                        AndroidView(
                            factory = { ctx ->
                                TextView(ctx).apply {
                                    setTextColor(android.graphics.Color.parseColor("#e2e8f0"))
                                    textSize = 15f
                                }
                            },
                            update = { tv ->
                                markwon.setMarkdown(tv, msg.text)
                            },
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = msg.timestamp,
                color = OnSurfaceMuted,
                fontSize = 11.sp,
            )
        }
    }
}

@Composable
fun ThinkingSection(
    toolSteps: List<ToolStep>,
    isExpanded: Boolean,
    onToggle: () -> Unit,
    onToggleStep: (Int) -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, ToolRunning.copy(alpha = 0.4f), RoundedCornerShape(8.dp)),
        color = AssistantBubble,
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onToggle() }
                    .padding(10.dp, 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "Thinking\u2026",
                    color = ToolRunning,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = if (isExpanded) "\u25b2" else "\u25bc",
                    color = OnSurfaceMuted,
                    fontSize = 11.sp,
                )
            }
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(),
                exit = shrinkVertically(),
            ) {
                Column(modifier = Modifier.padding(8.dp, 0.dp, 8.dp, 8.dp)) {
                    toolSteps.forEachIndexed { index, step ->
                        ToolStepRow(
                            step = step,
                            onToggle = { onToggleStep(index) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ToolStepRow(step: ToolStep, onToggle: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onToggle() }
            .padding(vertical = 4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ToolStatusIcon(step.status)
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = step.toolName,
                color = OnSurfaceLight,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f),
            )
            if (step.status != ToolStatus.RUNNING && step.elapsedMs > 0) {
                Text(
                    text = "(${step.elapsedMs / 1000.0}s)",
                    color = OnSurfaceMuted,
                    fontSize = 11.sp,
                )
            }
        }

        AnimatedVisibility(visible = step.expanded) {
            Column(modifier = Modifier.padding(start = 22.dp, top = 4.dp)) {
                if (step.arguments.isNotBlank() && step.arguments != "{}") {
                    Text(
                        text = "Args: ${step.arguments}",
                        color = OnSurfaceMuted,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                    )
                }
                if (step.result.isNotBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = step.result,
                        color = OnSurfaceMuted,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        maxLines = 6,
                    )
                }
            }
        }
    }
}

@Composable
fun ToolStatusIcon(status: ToolStatus) {
    when (status) {
        ToolStatus.RUNNING -> {
            val transition = rememberInfiniteTransition(label = "spin")
            val angle by transition.animateFloat(
                initialValue = 0f,
                targetValue = 360f,
                animationSpec = infiniteRepeatable(
                    animation = tween(1000, easing = LinearEasing),
                    repeatMode = RepeatMode.Restart,
                ),
                label = "spin",
            )
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .rotate(angle)
                    .border(2.dp, ToolRunning, CircleShape),
            )
        }
        ToolStatus.SUCCESS -> {
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .background(ToolSuccess, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = "\u2713", color = OnSurfaceLight, fontSize = 10.sp)
            }
        }
        ToolStatus.ERROR -> {
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .background(ToolError, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = "\u2715", color = OnSurfaceLight, fontSize = 10.sp)
            }
        }
    }
}

@Composable
fun TypingIndicator() {
    val transition = rememberInfiniteTransition(label = "typing")
    val alpha by transition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(600),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "typing",
    )
    Text(
        text = "\u25cf\u25cf\u25cf",
        color = OnSurfaceMuted.copy(alpha = alpha),
        fontSize = 16.sp,
        letterSpacing = 4.sp,
    )
}

@Composable
fun RouteImageBubble(msg: ChatMessage.RouteImage) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
    ) {
        Column {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(AssistantBubble)
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                    .pointerInput(Unit) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            scale = (scale * zoom).coerceIn(0.5f, 4f)
                            offset += pan
                        }
                    },
            ) {
                Image(
                    bitmap = msg.bitmap.asImageBitmap(),
                    contentDescription = "Route map",
                    modifier = Modifier
                        .width(280.dp)
                        .graphicsLayer(
                            scaleX = scale,
                            scaleY = scale,
                            translationX = offset.x,
                            translationY = offset.y,
                        ),
                )
            }
            Spacer(modifier = Modifier.height(2.dp))
            Text(text = msg.timestamp, color = OnSurfaceMuted, fontSize = 11.sp)
        }
    }
}

@Composable
fun ErrorMessageBubble(msg: ChatMessage.Error) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
    ) {
        Column {
            Box(
                modifier = Modifier
                    .widthIn(max = 300.dp)
                    .clip(RoundedCornerShape(4.dp, 16.dp, 16.dp, 16.dp))
                    .background(ToolError.copy(alpha = 0.15f))
                    .border(1.dp, ToolError.copy(alpha = 0.5f), RoundedCornerShape(4.dp, 16.dp, 16.dp, 16.dp))
                    .padding(12.dp, 8.dp),
            ) {
                Text(
                    text = msg.text,
                    color = ToolError,
                    fontSize = 14.sp,
                )
            }
            Spacer(modifier = Modifier.height(2.dp))
            Text(text = msg.timestamp, color = OnSurfaceMuted, fontSize = 11.sp)
        }
    }
}

@Composable
fun CommandSuggestionPopup(onSelect: (String) -> Unit) {
    val commands = listOf(
        "/navigate" to "navigate [from] [to]",
        "/info" to "info [node_name]",
        "/query" to "query [node_name] [attr?]",
    )
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f), RoundedCornerShape(8.dp)),
        color = AssistantBubble,
    ) {
        Column(modifier = Modifier.padding(4.dp)) {
            commands.forEach { (cmd, hint) ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(cmd) }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = cmd,
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.width(100.dp),
                    )
                    Text(
                        text = hint,
                        color = OnSurfaceMuted,
                        fontSize = 12.sp,
                    )
                }
            }
        }
    }
}
