package com.e611.trentnavi

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import com.e611.trentnavi.ui.chat.ChatScreen
import com.e611.trentnavi.ui.theme.AppBackground
import com.e611.trentnavi.ui.theme.TrentAINaviTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        enableEdgeToEdge()
        setContent {
            TrentAINaviTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = AppBackground,
                ) {
                    ChatScreen()
                }
            }
        }
    }
}
