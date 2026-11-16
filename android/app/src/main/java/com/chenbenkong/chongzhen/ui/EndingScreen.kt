package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chenbenkong.chongzhen.ui.theme.Cinnabar
import com.chenbenkong.chongzhen.ui.theme.Gold
import com.chenbenkong.chongzhen.ui.theme.ParchmentDim

// ============================================================================
// 结局屏：结局标题 / 品级（中文化）/ 传记 / 属性终值 / 结局回顾。
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
            .padding(28.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (ending == null) {
                Text("结局记录缺失", style = MaterialTheme.typography.headlineMedium)
                return
            }

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

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                DeltaChip(text = ending.tierLabel, positive = true)
                DeltaChip(text = ending.categoryLabel, positive = false)
            }

            if (ending.declinable) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = "可搁笔结局：此局可就此收束，亦可继续仕途。",
                        style = MaterialTheme.typography.bodyMedium,
                        color = ParchmentDim
                    )
                }
            }

            ending.resultTitle?.takeIf { it.isNotBlank() }?.let {
                Text(text = it, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Gold)
            }

            ending.tags?.takeIf { it.isNotEmpty() }?.let { tags ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    tags.forEach { DeltaChip(text = it, positive = true) }
                }
            }

            if (ending.biography.isNotBlank()) {
                Text(
                    text = ending.biography,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            ending.echo?.takeIf { it.isNotBlank() }?.let {
                Text(text = it, style = MaterialTheme.typography.bodyMedium, color = ParchmentDim)
            }

            board?.let { snap ->
                SectionLabel("属性终值")
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    snap.attributes.forEach { (k, v) -> EndingRow(k, v.toInt().toString()) }
                    snap.court.forEach { (k, v) -> EndingRow(k, v.toInt().toString()) }
                }
            }

            if (ending.history.isNotEmpty()) {
                SectionLabel("结局回顾")
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    ending.history.forEach { record ->
                        Text(text = record, style = MaterialTheme.typography.bodySmall, color = ParchmentDim)
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(top = 12.dp)) {
                GhostButton(text = "返回标题", onClick = { viewModel.backToTitle() })
                PrimaryButton(text = "另起一局", onClick = { viewModel.restartFresh() })
            }
        }
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
