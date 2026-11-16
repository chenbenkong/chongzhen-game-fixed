package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chenbenkong.chongzhen.data.OriginConfig
import com.chenbenkong.chongzhen.ui.theme.CinnabarBright
import com.chenbenkong.chongzhen.ui.theme.Gold
import com.chenbenkong.chongzhen.ui.theme.ParchmentDim

// ============================================================================
// 出身屏：8 张出身卡网格，读 data.origins；显示初始属性、标签与说明，点选即开局。
// ============================================================================

@Composable
fun OriginSelectScreen(state: UiState, viewModel: BoardViewModel) {
    val origins = viewModel.data?.origins.orEmpty()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "铨 选 出 身",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "先选个出身，毕竟在上位者眼里，诸位大人的斤两从一开始便标好了价。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = ParchmentDim
                )
            }
            GhostButton(text = "← 返回", onClick = { viewModel.backToTitle() })
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(4),
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            items(origins, key = { it.type }) { origin ->
                OriginCard(origin = origin, onClick = { viewModel.selectOrigin(origin.type) })
            }
        }
    }
}

@Composable
private fun OriginCard(origin: OriginConfig, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .heightIn(min = 220.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = origin.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = Gold
            )
            Text(
                text = "${origin.initialRank}·${origin.initialDegree}",
                style = MaterialTheme.typography.labelMedium,
                color = ParchmentDim
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            origin.tags.take(3).forEach { tag ->
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(text = tag, style = MaterialTheme.typography.labelSmall, color = ParchmentDim)
                }
            }
        }

        Text(
            text = origin.background,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 4
        )

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            origin.initialAttributes.entries.forEach { (key, value) ->
                AttrRow(key = key, value = value)
            }
        }

        if (origin.playStyle.isNotBlank()) {
            Text(
                text = "玩法风格：${origin.playStyle}",
                style = MaterialTheme.typography.labelMedium,
                color = CinnabarBright
            )
        }
    }
}

@Composable
private fun AttrRow(key: String, value: Double) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = key, style = MaterialTheme.typography.labelMedium, color = ParchmentDim, modifier = Modifier.width(40.dp))
        Box(
            modifier = Modifier
                .weight(1f)
                .heightIn(min = 6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(((value / 100.0).coerceIn(0.05, 1.0)).toFloat())
                    .background(Gold)
            )
        }
        Text(text = value.toInt().toString(), style = MaterialTheme.typography.labelMedium)
    }
}
