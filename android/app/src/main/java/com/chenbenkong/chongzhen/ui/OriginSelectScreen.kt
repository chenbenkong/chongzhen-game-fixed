package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chenbenkong.chongzhen.data.OriginConfig
import com.chenbenkong.chongzhen.ui.theme.CardInk
import com.chenbenkong.chongzhen.ui.theme.CardInkDeep
import com.chenbenkong.chongzhen.ui.theme.CinnabarBright
import com.chenbenkong.chongzhen.ui.theme.Gold
import com.chenbenkong.chongzhen.ui.theme.PanelBorder
import com.chenbenkong.chongzhen.ui.theme.ParchmentDim

// ============================================================================
// 出身屏：8 张出身卡两排四列。默认只露身份与“详情 / 选此”，
// 背景、标签、玩法风格与五围都收进详情，展开才占高。
// 属性是紧凑值块，不用横条。
// ============================================================================

@Composable
fun OriginSelectScreen(state: UiState, viewModel: BoardViewModel) {
    val origins = viewModel.data?.origins.orEmpty()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "铨 选 出 身",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = Gold
            )
            GhostButton(text = "← 返回", onClick = { viewModel.backToTitle() })
        }

        Text(
            text = "先选个出身，毕竟在上位者眼里，诸位大人的斤两从一开始便标好了价。",
            style = MaterialTheme.typography.labelSmall,
            color = ParchmentDim,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            origins.chunked(4).forEach { rowOrigins ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    rowOrigins.forEach { origin ->
                        OriginCard(
                            origin = origin,
                            onSelect = { viewModel.selectOrigin(origin.type) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    repeat(4 - rowOrigins.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun OriginCard(
    origin: OriginConfig,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(3.dp))
            .background(
                androidx.compose.ui.graphics.Brush.verticalGradient(
                    listOf(CardInk, CardInkDeep)
                )
            )
            .border(1.dp, PanelBorder, RoundedCornerShape(3.dp))
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = origin.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = Gold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = "${origin.initialRank}·${origin.initialDegree}",
                style = MaterialTheme.typography.labelSmall,
                color = ParchmentDim,
                maxLines = 1
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            GhostButton(
                text = if (expanded) "收起" else "详情",
                onClick = { expanded = !expanded },
                modifier = Modifier.weight(1f)
            )
            PrimaryButton(
                text = "选此",
                onClick = onSelect,
                modifier = Modifier.weight(1.45f)
            )
        }

        if (expanded) {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                OriginAttrGrid(origin.initialAttributes)
                Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    origin.tags.take(3).forEach { tag ->
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(2.dp))
                                .border(1.dp, PanelBorder, RoundedCornerShape(2.dp))
                                .padding(horizontal = 5.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = tag,
                                style = MaterialTheme.typography.labelSmall,
                                color = ParchmentDim
                            )
                        }
                    }
                }
                Text(
                    text = origin.background,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
                if (origin.playStyle.isNotBlank()) {
                    Text(
                        text = "玩法风格：${origin.playStyle}",
                        style = MaterialTheme.typography.labelSmall,
                        color = CinnabarBright,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
private fun OriginAttrGrid(attributes: Map<String, Double>) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        attributes.entries.chunked(3).forEach { rowEntries ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                rowEntries.forEach { (key, value) ->
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(2.dp))
                            .border(1.dp, PanelBorder, RoundedCornerShape(2.dp))
                            .padding(horizontal = 5.dp, vertical = 3.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = key,
                            style = MaterialTheme.typography.labelSmall,
                            color = ParchmentDim,
                            fontSize = 10.sp,
                            maxLines = 1
                        )
                        Text(
                            text = value.toInt().toString(),
                            style = MaterialTheme.typography.labelMedium,
                            color = Gold,
                            fontSize = 11.sp
                        )
                    }
                }
                repeat(3 - rowEntries.size) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}
