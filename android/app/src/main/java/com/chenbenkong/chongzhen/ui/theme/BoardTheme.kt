package com.chenbenkong.chongzhen.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// ============================================================================
// 原生牌桌视觉基调：对齐 Web 版的墨黑 / 宣纸 / 旧金配色与宋体阅读感。
// 不打包字体文件，全部走系统衬线字体（Songti / Noto Serif / 宋体）。
// ============================================================================

/** 桌面底色。 */
val InkBlack = Color(0xFF0A0806)

/** 深墨卡片底（与 Web 的 #161210 / #0D0A08 同族）。 */
val CardInk = Color(0xFF161210)

/** 更深的底部渐变。 */
val CardInkDeep = Color(0xFF0D0A08)

/** 宣纸色（主文字）。 */
val Parchment = Color(0xFFF5E6C8)

/** 宣纸暗部（次要文字），与 Web 的 #C9B896 对齐。 */
val ParchmentDim = Color(0xFFC9B896)

/** 更暗的辅助文字。 */
val ParchmentFaint = Color(0xFF8B7540)

/** 旧金（标题 / 主强调）。 */
val Gold = Color(0xFFC5A55A)

/** 暗金（边框 / 次级强调）。 */
val GoldDark = Color(0xFF9A7B3A)

/** 深棕红（危机 / 贬官）。 */
val Cinnabar = Color(0xFF5C3A1E)

/** 亮朱砂（危险值 / 重点提示）。 */
val CinnabarBright = Color(0xFFC23B32)

/** 面板细线。 */
val PanelBorder = Color(0xFF2A2015)

/** 面板亮线。 */
val PanelBorderStrong = Color(0xFF4A3820)

/** 败绩 / 贬官提示色。 */
val MutedRed = Color(0xFF7A1F1F)

private val BoardColorScheme = darkColorScheme(
    background = InkBlack,
    surface = CardInk,
    onSurface = Parchment,
    surfaceVariant = Color(0xFF211C16),
    onSurfaceVariant = ParchmentDim,
    primary = Gold,
    onPrimary = InkBlack,
    secondary = GoldDark,
    onSecondary = Parchment,
    outline = PanelBorder,
    error = CinnabarBright
)

private val BoardTypography = Typography(
    headlineLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Bold,
        fontSize = 26.sp,
        lineHeight = 34.sp,
        letterSpacing = 4.sp
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 28.sp,
        letterSpacing = 2.sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Bold,
        fontSize = 19.sp,
        lineHeight = 25.sp,
        letterSpacing = 1.sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 21.sp
    ),
    titleSmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 18.sp,
        letterSpacing = 1.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Normal,
        fontSize = 12.5.sp,
        lineHeight = 18.sp
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 18.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Normal,
        fontSize = 11.5.sp,
        lineHeight = 15.sp
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Normal,
        fontSize = 10.5.sp,
        lineHeight = 14.sp
    )
)

@Composable
fun BoardTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = BoardColorScheme,
        typography = BoardTypography,
        content = content
    )
}
