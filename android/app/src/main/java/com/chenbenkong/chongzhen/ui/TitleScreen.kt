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
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        Text(
            text = "崇祯·宦海浮沉",
            style = MaterialTheme.typography.headlineLarge,
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
            style = MaterialTheme.typography.bodyLarge,
            color = ParchmentDim
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(top = 8.dp)
        ) {
            PrimaryButton(text = "开始仕途", onClick = { viewModel.beginNewGame() })
            GhostButton(
                text = "继续上次",
                onClick = { viewModel.continueGame() },
                enabled = state.savePreview != null
            )
        }

        state.savePreview?.let { preview ->
            Text(
                text = "存档：${preview.playerName} · ${toMingEraYear(preview.year)}${monthName(preview.month)} · " +
                    "${preview.rank} · ${preview.age}岁 · ${preview.originName}",
                style = MaterialTheme.typography.bodyMedium,
                color = ParchmentDim
            )
        }

        // 难度三选（文案读 data.difficulties）
        data?.let { gameData ->
            Column(
                modifier = Modifier
                    .fillMaxWidth(0.8f)
                    .padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                SectionLabel("难度")
                gameData.difficulties.forEach { diff ->
                    val selected = state.difficultyId == diff.id
                    DifficultyOption(
                        name = diff.name.ifBlank { diff.id },
                        description = diff.description,
                        selected = selected,
                        onClick = { viewModel.setDifficulty(diff.id) }
                    )
                }
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
private fun DifficultyOption(
    name: String,
    description: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(
                if (selected) {
                    Brush.verticalGradient(listOf(Color(0xFF221A10), CardInkDeep))
                } else {
                    Brush.verticalGradient(listOf(CardInk, CardInkDeep))
                }
            )
            .border(
                1.dp,
                if (selected) GoldDark else PanelBorder,
                RoundedCornerShape(3.dp)
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .width(14.dp)
                .heightIn(min = 14.dp)
                .clip(RoundedCornerShape(1.dp))
                .border(1.dp, if (selected) Gold else PanelBorder, RoundedCornerShape(1.dp))
                .background(if (selected) Gold.copy(alpha = 0.35f) else Color.Transparent)
        )
        Column {
            Text(
                text = name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (selected) Gold else MaterialTheme.colorScheme.onSurface
            )
            if (description.isNotBlank()) {
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = ParchmentDim
                )
            }
        }
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
