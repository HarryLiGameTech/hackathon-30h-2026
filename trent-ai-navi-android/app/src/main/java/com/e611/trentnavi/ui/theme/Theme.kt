package com.e611.trentnavi.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val TrentDarkColors = darkColorScheme(
    primary = AppPrimary,
    secondary = AppSecondary,
    background = AppBackground,
    surface = AppSurface,
    onPrimary = OnSurfaceLight,
    onSecondary = OnSurfaceLight,
    onBackground = OnSurfaceLight,
    onSurface = OnSurfaceLight,
)

@Composable
fun TrentAINaviTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = TrentDarkColors,
        typography = Typography,
        content = content,
    )
}
