package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.chenbenkong.chongzhen.audio.BgmPlayer

/**
 * 原生音乐开关：44dp 方形触控，和网页版标题屏 / 牌桌的「乐 / 静」一致。
 * 标题屏放在「开始仕途 / 继续上次」一排，牌桌放在底部操作条，默认收起后
 * 不占正文空间。
 */
@Composable
fun BgmButton() {
    GhostButton(
        text = if (BgmPlayer.isEnabled) "乐" else "静",
        onClick = { BgmPlayer.toggle() },
        modifier = Modifier.width(44.dp)
    )
}
