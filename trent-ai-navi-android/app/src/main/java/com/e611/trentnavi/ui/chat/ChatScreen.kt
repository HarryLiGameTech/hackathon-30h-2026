package com.e611.trentnavi.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.e611.trentnavi.BuildConfig
import com.e611.trentnavi.ui.theme.AppBackground
import com.e611.trentnavi.ui.theme.AppPrimary
import com.e611.trentnavi.ui.theme.AppSecondary
import com.e611.trentnavi.ui.theme.AppSurface
import com.e611.trentnavi.ui.theme.OnSurfaceLight
import com.e611.trentnavi.ui.theme.OnSurfaceMuted
import com.e611.trentnavi.ui.theme.ToolRunning
import com.e611.trentnavi.viewmodel.ChatMessage
import com.e611.trentnavi.viewmodel.ChatViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(viewModel: ChatViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var showMenu by remember { mutableStateOf(false) }

    // Auto-scroll to bottom on new messages
    LaunchedEffect(uiState.messages.size, uiState.messages.lastOrNull()) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.lastIndex)
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = AppSurface) {
                NavigationDrawerContent(
                    onNewConversation = {
                        viewModel.newConversation()
                        scope.launch { drawerState.close() }
                    },
                )
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(AppBackground)
                .statusBarsPadding(),
        ) {
            // Top bar
            TopAppBar(
                title = {
                    Text(
                        text = "Trent Navigator",
                        color = OnSurfaceLight,
                        fontWeight = FontWeight.SemiBold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { scope.launch { drawerState.open() } }) {
                        Icon(Icons.Default.Menu, contentDescription = "Menu", tint = OnSurfaceLight)
                    }
                },
                actions = {
                    IconButton(onClick = { showMenu = true }) {
                        Icon(Icons.Default.MoreVert, contentDescription = "More", tint = OnSurfaceLight)
                    }
                    DropdownMenu(
                        expanded = showMenu,
                        onDismissRequest = { showMenu = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text("New Conversation") },
                            onClick = {
                                showMenu = false
                                viewModel.newConversation()
                            },
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AppSurface),
            )

            // Chat list
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item { Spacer(modifier = Modifier.height(8.dp)) }
                itemsIndexed(uiState.messages) { idx, msg ->
                    when (msg) {
                        is ChatMessage.User -> UserMessageBubble(msg)
                        is ChatMessage.Assistant -> AssistantMessageBubble(
                            msg = msg,
                            msgIdx = idx,
                            onToggleStep = { stepIdx -> viewModel.toggleToolStep(idx, stepIdx) },
                            onToggleThinking = { viewModel.toggleThinkingSection(idx) },
                        )
                        is ChatMessage.RouteImage -> RouteImageBubble(msg)
                        is ChatMessage.Error -> ErrorMessageBubble(msg)
                    }
                }
                item { Spacer(modifier = Modifier.height(4.dp)) }
            }

            // Bottom input area
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(AppSurface)
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .navigationBarsPadding()
                    .imePadding(),
            ) {
                if (uiState.showCommandSuggestions) {
                    CommandSuggestionPopup(
                        onSelect = { cmd -> viewModel.insertCommand(cmd) },
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    OutlinedTextField(
                        value = uiState.inputText,
                        onValueChange = viewModel::onInputChange,
                        modifier = Modifier.weight(1f),
                        placeholder = {
                            Text("Ask anything or type /…", color = OnSurfaceMuted, fontSize = 14.sp)
                        },
                        enabled = !uiState.isStreaming,
                        maxLines = 5,
                        textStyle = TextStyle(color = OnSurfaceLight, fontSize = 15.sp),
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Sentences,
                            imeAction = ImeAction.Send,
                        ),
                        keyboardActions = KeyboardActions(
                            onSend = { viewModel.sendMessage() },
                        ),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AppPrimary,
                            unfocusedBorderColor = OnSurfaceMuted.copy(alpha = 0.4f),
                            disabledBorderColor = OnSurfaceMuted.copy(alpha = 0.2f),
                            cursorColor = AppPrimary,
                        ),
                        shape = RoundedCornerShape(12.dp),
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    // Send / Stop button
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .then(
                                if (uiState.isStreaming)
                                    Modifier.background(ToolRunning)
                                else
                                    Modifier.background(
                                        Brush.linearGradient(listOf(AppPrimary, AppSecondary))
                                    )
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        IconButton(
                            onClick = {
                                if (uiState.isStreaming) viewModel.cancelStream()
                                else viewModel.sendMessage()
                            },
                            modifier = Modifier.size(48.dp),
                        ) {
                            Text(
                                text = if (uiState.isStreaming) "\u25a0" else "\u2191",
                                color = Color.White,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun NavigationDrawerContent(onNewConversation: () -> Unit) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text(
            text = "Trent Navigator",
            color = OnSurfaceLight,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = "v${BuildConfig.VERSION_NAME}",
            color = OnSurfaceMuted,
            fontSize = 12.sp,
        )
        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Commands",
            color = OnSurfaceLight,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(8.dp))
        CommandReference()

        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = "About Trent Building",
            color = OnSurfaceLight,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Trent Building is a multi-floor academic building. Use Trent Navigator to find rooms, facilities, and get walking directions.",
            color = OnSurfaceMuted,
            fontSize = 13.sp,
            lineHeight = 20.sp,
        )

        Spacer(modifier = Modifier.height(24.dp))
        TextButton(
            onClick = onNewConversation,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = "+ New Conversation",
                color = AppPrimary,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
fun CommandReference() {
    val items = listOf(
        "/navigate [from] [to]" to "Get directions between two locations",
        "/info [location]" to "Learn about a location",
        "/query [location] [attr?]" to "Query a specific attribute",
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { (cmd, desc) ->
            Column {
                Text(text = cmd, color = AppPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                Text(text = desc, color = OnSurfaceMuted, fontSize = 12.sp)
            }
        }
    }
}
