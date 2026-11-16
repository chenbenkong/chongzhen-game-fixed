package com.chenbenkong.chongzhen.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// ============================================================================
// 原生牌桌视觉基调：墨黑底 + 宣纸色文字 + 朱砂点缀。
// 不额外打包字体，全部走系统字体；不做花哨动画。
// ============================================================================

/** 墨黑（桌面底色）。 */
val InkBlack = Color(0xFF14110E)

/** 深墨卡片底。 */
val CardInk = Color(0xFF211C16)

/** 宣纸色（主文字）。 */
val Parchment = Color(0xFFE8DCC0)

/** 宣纸暗部（次要文字）。 */
val ParchmentDim = Color(0xFFB8A988)

/** 朱砂（主强调 / 关键按钮）。 */
val Cinnabar = Color(0xFF9E2B25)

/** 朱砂亮部（可点主按钮）。 */
val CinnabarBright = Color(0xFFC23B32)

/** 旧金（次要强调 / 品级标签）。 */
val Gold = Color(0xFF9A7B3A)

/** 败绩 / 贬官提示色。 */
val MutedRed = Color(0xFF7A1F1F)

private val BoardColorScheme = darkColorScheme(
    background = InkBlack,
    surface = CardInk,
    onSurface = Parchment,
    surfaceVariant = Color(0xFF2E271E),
    onSurfaceVariant = ParchmentDim,
    primary = CinnabarBright,
    onPrimary = Parchment,
    secondary = Gold,
    onSecondary = InkBlack,
    outline = ParchmentDim,
    error = CinnabarBright
)

@Composable
fun BoardTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = BoardColorScheme,
        content = content
    )
}
