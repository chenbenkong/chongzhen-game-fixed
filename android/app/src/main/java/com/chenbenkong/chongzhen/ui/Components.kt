package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chenbenkong.chongzhen.ui.theme.CardInk
import com.chenbenkong.chongzhen.ui.theme.CardInkDeep
import com.chenbenkong.chongzhen.ui.theme.Gold
import com.chenbenkong.chongzhen.ui.theme.GoldDark
import com.chenbenkong.chongzhen.ui.theme.PanelBorder
import com.chenbenkong.chongzhen.ui.theme.Parchment
import com.chenbenkong.chongzhen.ui.theme.ParchmentDim
import com.chenbenkong.chongzhen.ui.theme.ParchmentFaint

private val ButtonShape = RoundedCornerShape(3.dp)

/** 主按钮：暗底 + 旧金描边，对齐 Web 的 ActionBar 主操作。 */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Box(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clip(ButtonShape)
            .background(
                if (enabled) {
                    Brush.verticalGradient(listOf(CardInk, CardInkDeep))
                } else {
                    Brush.verticalGradient(listOf(Color(0xFF15120E), Color(0xFF0D0B08)))
                }
            )
            .border(
                1.dp,
                if (enabled) GoldDark else PanelBorder,
                ButtonShape
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 2.sp,
            color = if (enabled) Gold else ParchmentFaint
        )
    }
}

/** 次要描边按钮：Web 低对比金线按钮。 */
@Composable
fun GhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Box(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clip(ButtonShape)
            .border(
                1.dp,
                if (enabled) PanelBorder else Color(0xFF1A1410),
                ButtonShape
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            letterSpacing = 1.sp,
            color = if (enabled) ParchmentDim else ParchmentFaint
        )
    }
}

/** 状态胶囊（HUD 用，紧凑）。 */
@Composable
fun StatCapsule(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    accent: Boolean = false
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = ParchmentDim
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (accent) Gold else MaterialTheme.colorScheme.onSurface
        )
    }
}

/** 增减结果 chip。 */
@Composable
fun DeltaChip(text: String, positive: Boolean, modifier: Modifier = Modifier) {
    val color = if (positive) Gold else Color(0xFFD08A73)
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(2.dp))
            .border(1.dp, if (positive) PanelBorder else Color(0xFF3A2018), RoundedCornerShape(2.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(text = text, style = MaterialTheme.typography.labelLarge, color = color)
    }
}

/** 面板内分区标题：居中、旧金、字距拉开，模仿 Web 的 section-title。 */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        modifier = modifier.padding(vertical = 4.dp),
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Normal,
        letterSpacing = 2.sp,
        color = Gold
    )
}
