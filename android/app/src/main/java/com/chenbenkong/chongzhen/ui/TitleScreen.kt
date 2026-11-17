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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chenbenkong.chongzhen.ui.theme.CardInk
import com.chenbenkong.chongzhen.ui.theme.CardInkDeep
import com.chenbenkong.chongzhen.ui.theme.Gold
import com.chenbenkong.chongzhen.ui.theme.GoldDark
import com.chenbenkong.chongzhen.ui.theme.PanelBorder
import com.chenbenkong.chongzhen.ui.theme.ParchmentDim

// ============================================================================
// 标题屏：标题 / 开始仕途 / 继续上次（存档预览）/ 难度三选 / 结局图鉴入口。
// 难度文案读 data.difficulties，不自造选项。
// ============================================================================

@Composable
fun TitleScreen(state: UiState, viewModel: BoardViewModel) {
    val data = viewModel.data
    var showCodex by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = "崇祯·宦海浮沉",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = Gold
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(0.42f)
                .heightIn(min = 1.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(Color.Transparent, GoldDark, Color.Transparent)
                    )
                )
        )
        Text(
            text = "「名以正体，字以表德。」",
            style = MaterialTheme.typography.labelMedium,
            color = ParchmentDim
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            PrimaryButton(text = "开始仕途", onClick = { viewModel.beginNewGame() })
            GhostButton(
                text = "继续上次",
                onClick = { viewModel.continueGame() },
                enabled = state.savePreview != null
            )
            BgmButton()
        }

        state.savePreview?.let { preview ->
            Text(
                text = "存档：${preview.playerName} · ${toMingEraYear(preview.year)}${monthName(preview.month)} · " +
                    "${preview.rank} · ${preview.age}岁 · ${preview.originName}",
                style = MaterialTheme.typography.labelSmall,
                color = ParchmentDim,
                maxLines = 1
            )
        }

        // 难度三选横向排列，说明只显示当前选中一条，不再每个难度各占两行
        data?.let { gameData ->
            val selected = gameData.difficulties.firstOrNull { it.id == state.difficultyId }
            Row(
                modifier = Modifier.fillMaxWidth(0.7f),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                gameData.difficulties.forEach { diff ->
                    DifficultyChip(
                        name = diff.name.ifBlank { diff.id },
                        selected = state.difficultyId == diff.id,
                        onClick = { viewModel.setDifficulty(diff.id) },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
            if (selected?.description?.isNotBlank() == true) {
                Text(
                    text = selected.description,
                    style = MaterialTheme.typography.labelSmall,
                    color = ParchmentDim,
                    maxLines = 1
                )
            }
        }

        GhostButton(
            text = "结局图鉴（已解锁 ${state.unlockedEndingCount} / ${state.endingTotal}）",
            onClick = { showCodex = true }
        )
    }

    if (showCodex) {
        CodexDialog(
            entries = state.codex,
            onDismiss = { showCodex = false }
        )
    }
}

@Composable
private fun DifficultyChip(
    name: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(
                if (selected) Gold.copy(alpha = 0.16f) else CardInkDeep
            )
            .border(
                1.dp,
                if (selected) Gold else PanelBorder,
                RoundedCornerShape(3.dp)
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = name,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (selected) Gold else MaterialTheme.colorScheme.onSurface,
            maxLines = 1
        )
    }
}

/** 结局图鉴弹窗：已解锁显示标题，未解锁遮盖。 */
@Composable
fun CodexDialog(
    entries: List<CodexEntry>,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("结局图鉴") },
        text = {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                entries.forEach { entry ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            text = if (entry.unlocked) "◆" else "◇",
                            color = if (entry.unlocked) Gold else ParchmentDim
                        )
                        Text(
                            text = if (entry.unlocked) entry.title ?: entry.id else "？？？",
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (entry.unlocked) MaterialTheme.colorScheme.onSurface else ParchmentDim
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("闭 卷") }
        }
    )
}
