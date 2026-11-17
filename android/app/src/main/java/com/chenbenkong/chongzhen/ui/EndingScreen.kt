package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.chenbenkong.chongzhen.ui.theme.Cinnabar
import com.chenbenkong.chongzhen.ui.theme.Gold
import com.chenbenkong.chongzhen.ui.theme.ParchmentDim
import kotlin.math.roundToInt

// ============================================================================
// 结局屏：默认只留结局标题 / 品级 / 一句收束 / 三个关键数字。
// 史馆传略、属性终值、青史留名、结局回顾统一收进「完整结算」，默认不铺满。
// 死亡结局走深色朱砂覆盖层；可搁笔结局标注「搁笔」与对应文案。
// ============================================================================

@Composable
fun EndingScreen(state: UiState, viewModel: BoardViewModel) {
    val ending = state.ending
    val board = state.board

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                if (ending?.death == true) Cinnabar.copy(alpha = 0.12f)
                else MaterialTheme.colorScheme.background
            )
            .padding(horizontal = 24.dp, vertical = 18.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (ending == null) {
                Text("结局记录缺失", style = MaterialTheme.typography.headlineMedium)
                return
            }

            var detailsExpanded by remember { mutableStateOf(false) }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = if (ending.death) "卒" else "搁 笔",
                    style = MaterialTheme.typography.labelLarge,
                    color = Cinnabar,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = ending.event.title,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DeltaChip(text = ending.tierLabel, positive = true)
                DeltaChip(text = ending.categoryLabel, positive = false)
            }

            if (ending.declinable) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = "可搁笔结局：此局可就此收束，亦可继续仕途。",
                        style = MaterialTheme.typography.bodySmall,
                        color = ParchmentDim
                    )
                }
            }

            ending.resultTitle?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Gold
                )
            }

            ending.echo?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = ParchmentDim,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center
                )
            }

            // 默认只露三个数字；详细属性全部收进「完整结算」。
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                EndingFact("功过", board?.meritScore?.roundToInt()?.toString() ?: "—")
                EndingFact("官至", board?.rank ?: "—")
                EndingFact("历事", (board?.history?.size ?: ending.history.size).toString())
            }

            // 展开入口：不给一上来就铺满十三行属性。
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { detailsExpanded = !detailsExpanded }
                    .padding(vertical = 5.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (detailsExpanded) "收起完整结算" else "完整史传与功过",
                    style = MaterialTheme.typography.bodySmall,
                    color = ParchmentDim
                )
                Text(
                    text = if (detailsExpanded) "▲" else "▼",
                    style = MaterialTheme.typography.bodySmall,
                    color = Gold
                )
            }

            if (detailsExpanded) {
                if (ending.biography.isNotBlank()) {
                    SectionLabel("史馆传略")
                    Text(
                        text = ending.biography,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                board?.let { snap ->
                    SectionLabel("属性终值")
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        snap.attributes.forEach { (k, v) -> EndingRow(k, v.toInt().toString()) }
                        snap.court.forEach { (k, v) -> EndingRow(k, v.toInt().toString()) }
                    }
                }

                ending.tags?.takeIf { it.isNotEmpty() }?.let { tags ->
                    SectionLabel("青史留名")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        tags.forEach { DeltaChip(text = it, positive = true) }
                    }
                }

                if (ending.history.isNotEmpty()) {
                    SectionLabel("结局回顾")
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        ending.history.forEach { record ->
                            Text(
                                text = record,
                                style = MaterialTheme.typography.bodySmall,
                                color = ParchmentDim
                            )
                        }
                    }
                }
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.padding(top = 8.dp)
            ) {
                GhostButton(text = "返回首页", onClick = { viewModel.backToTitle() })
                PrimaryButton(
                    text = if (ending.retryLocked) "重走人生 · 已锁" else "重走人生",
                    enabled = ending.canRetry,
                    onClick = { viewModel.retryEnding() }
                )
            }
        }
    }
}

@Composable
private fun EndingFact(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = ParchmentDim
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = Gold,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun EndingRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = Gold)
    }
}
