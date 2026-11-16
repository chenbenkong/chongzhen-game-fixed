package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chenbenkong.chongzhen.ui.theme.Cinnabar
import com.chenbenkong.chongzhen.ui.theme.Gold
import com.chenbenkong.chongzhen.ui.theme.ParchmentDim

// ============================================================================
// 横屏牌桌：顶部 HUD + 中央事件卡（内部纵向滚动）+ 抉择区（右侧竖列，窄/矮屏落底部横排）
// + 底部操作条 + 右侧抽屉 + 升降提示条。
// ============================================================================

@Composable
fun BoardScreen(state: UiState, viewModel: BoardViewModel) {
    val board = state.board
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            if (board != null) TopHud(board, state, viewModel)
            state.banner?.let { BannerBar(it) }

            BoxWithConstraintsAdaptive(
                state = state,
                viewModel = viewModel,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            )

            BottomBar(state, viewModel)
        }

        if (state.drawerOpen) {
            DrawerScrim(onClose = { viewModel.toggleDrawer(false) })
            BoardDrawer(state, viewModel, modifier = Modifier.align(Alignment.CenterEnd))
        }
    }
}

// ---------------------------------------------------------------------- 顶部 HUD

@Composable
private fun TopHud(
    board: BoardSnapshot,
    state: UiState,
    viewModel: BoardViewModel
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 14.dp, vertical = 8.dp)
            .horizontalScroll(rememberScrollState()),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        StatCapsule(
            label = "年月",
            value = "${toMingEraYear(board.year)}${monthName(board.month)}"
        )
        StatCapsule(
            label = "姓名",
            value = buildString {
                append(board.name)
                if (board.courtesyName.isNotBlank()) append("·字").append(board.courtesyName)
            }
        )
        StatCapsule(label = "年岁", value = "${board.age}")
        StatCapsule(label = "官职", value = board.rank, accent = true)
        StatCapsule(label = "出身", value = board.originName)

        listOf("圣眷", "中官", "清议", "士绅", "民望", "国势").forEach { key ->
            StatCapsule(label = key, value = board.court[key]?.toInt()?.toString() ?: "—")
        }
        StatCapsule(label = "政绩", value = board.meritScore.toInt().toString(), accent = true)

        GhostButton(text = "卷宗", onClick = { viewModel.toggleDrawer(true) })
    }
}

@Composable
private fun BannerBar(banner: BannerView) {
    val bg = when (banner.kind) {
        BannerKind.Promotion -> Gold
        BannerKind.Demotion -> MaterialTheme.colorScheme.primary
        BannerKind.Crisis -> Cinnabar
        BannerKind.Info -> MaterialTheme.colorScheme.surfaceVariant
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(bg.copy(alpha = 0.18f))
            .padding(horizontal = 14.dp, vertical = 6.dp)
    ) {
        Text(
            text = banner.text,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

// ---------------------------------------------------------------------- 主体自适应

@Composable
private fun BoxWithConstraintsAdaptive(
    state: UiState,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier
) {
    androidx.compose.foundation.layout.BoxWithConstraints(modifier = modifier) {
        val wide = maxWidth >= 900.dp && maxHeight >= 400.dp
        if (wide) {
            Row(modifier = Modifier.fillMaxSize()) {
                EventCard(state, modifier = Modifier.weight(1f).fillMaxHeight())
                ChoicePanel(
                    state,
                    viewModel,
                    modifier = Modifier
                        .width(300.dp)
                        .fillMaxHeight()
                        .padding(start = 12.dp)
                )
            }
        } else {
            Column(modifier = Modifier.fillMaxSize()) {
                EventCard(state, modifier = Modifier.weight(1f).fillMaxWidth())
                ChoicePanel(
                    state,
                    viewModel,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp)
                )
            }
        }
    }
}

// ---------------------------------------------------------------------- 事件卡

@Composable
private fun EventCard(state: UiState, modifier: Modifier = Modifier) {
    val event = state.event
    Column(
        modifier = modifier
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(18.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (event == null) {
            Text("（本月无事可奏）", style = MaterialTheme.typography.bodyLarge, color = ParchmentDim)
            return
        }

        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = event.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f)
            )
            val pending = state.board?.pendingCount ?: 0
            if (pending > 0) {
                Text(
                    text = "待办 ${pending + 1}",
                    style = MaterialTheme.typography.labelMedium,
                    color = ParchmentDim
                )
            }
        }

        event.narrative?.speaker?.takeIf { it.name.isNotBlank() }?.let { speaker ->
            val who = listOfNotNull(speaker.name, speaker.title).joinToString("·")
            Text(text = who, style = MaterialTheme.typography.labelMedium, color = Gold)
        }
        event.narrative?.quote?.takeIf { it.isNotBlank() }?.let { quote ->
            Text(text = "「$quote」", style = MaterialTheme.typography.bodyLarge, color = ParchmentDim)
        }

        if (event.description.isNotBlank()) {
            Text(text = event.description, style = MaterialTheme.typography.bodyLarge)
        }
        event.narrative?.background?.takeIf { it.isNotBlank() }?.let { bg ->
            Text(text = bg, style = MaterialTheme.typography.bodyMedium, color = ParchmentDim)
        }
        event.narrative?.situation?.takeIf { it.isNotBlank() }?.let { sit ->
            Text(text = sit, style = MaterialTheme.typography.bodyMedium, color = ParchmentDim)
        }
    }
}

// ---------------------------------------------------------------------- 抉择区

@Composable
private fun ChoicePanel(
    state: UiState,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier
) {
    if (state.outcomeVisible && state.outcome != null) {
        OutcomePanel(state.outcome, viewModel, modifier)
        return
    }

    Column(
        modifier = modifier
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(14.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            text = "抉择",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
        state.choices.forEach { view ->
            ChoiceRow(view, onClick = { viewModel.choose(view.choice.id) })
        }
        if (state.choices.isEmpty()) {
            Text(text = "本事件暂无可选项。", style = MaterialTheme.typography.bodyMedium, color = ParchmentDim)
        }
    }
}

@Composable
private fun ChoiceRow(view: ChoiceView, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(
                1.dp,
                if (view.open) Cinnabar else MaterialTheme.colorScheme.outline,
                androidx.compose.foundation.shape.RoundedCornerShape(10.dp)
            )
            .clickable(enabled = view.open, onClick = onClick)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = view.choice.text,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = if (view.open) MaterialTheme.colorScheme.onSurface else ParchmentDim
        )
        view.choice.description?.takeIf { it.isNotBlank() }?.let {
            Text(text = it, style = MaterialTheme.typography.bodySmall, color = ParchmentDim)
        }
        if (!view.open) {
            Text(
                text = view.disabledReason ?: "条件未满足",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

// ---------------------------------------------------------------------- 结算面板

@Composable
private fun OutcomePanel(
    outcome: OutcomeView,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(14.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        outcome.outcome.resultTitle?.takeIf { it.isNotBlank() }?.let {
            Text(text = it, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Gold)
        }

        val chips = mutableListOf<String>()
        outcome.attrDeltas.forEach { (k, v) -> chips += "$k ${formatDelta(v)}" }
        outcome.stateDeltas.forEach { (k, v) -> chips += "$k ${formatDelta(v)}" }
        outcome.hiddenDeltas.forEach { (k, v) -> chips += "$k ${formatDelta(v)}" }
        if (chips.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                chips.take(6).forEach { chip ->
                    DeltaChip(text = chip, positive = !chip.contains("-"))
                }
            }
        }
        (outcome.addedFlags + outcome.removedFlags).forEach { flag ->
            Text(text = "票：$flag", style = MaterialTheme.typography.labelMedium, color = ParchmentDim)
        }

        outcome.outcome.resultEcho?.takeIf { it.isNotBlank() }?.let { echo ->
            Text(text = echo, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        }

        PrimaryButton(
            text = "继 续",
            onClick = { viewModel.proceedAfterOutcome() },
            modifier = Modifier.fillMaxWidth()
        )
    }
}

private fun formatDelta(v: Double): String {
    val n = v.toInt()
    return if (n >= 0) "+$n" else n.toString()
}

// ---------------------------------------------------------------------- 底部操作条

@Composable
private fun BottomBar(state: UiState, viewModel: BoardViewModel) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        GhostButton(text = "返回标题", onClick = { viewModel.backToTitle() })
        GhostButton(text = "撤销", onClick = { viewModel.undo() })
        GhostButton(text = "存档", onClick = { viewModel.saveNow() })
        Box(modifier = Modifier.weight(1f))
        state.advanceBlockedReason?.let {
            Text(text = it, style = MaterialTheme.typography.labelMedium, color = ParchmentDim)
        }
        PrimaryButton(
            text = "进下月",
            onClick = { viewModel.advanceMonth() },
            enabled = state.advanceBlockedReason == null && state.board != null
        )
    }
}

// ---------------------------------------------------------------------- 抽屉

@Composable
private fun DrawerScrim(onClose: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.45f))
            .clickable(onClick = onClose)
    )
}

@Composable
private fun BoardDrawer(
    state: UiState,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier
) {
    val board = state.board
    Box(
        modifier = modifier
            .fillMaxHeight()
            .fillMaxWidth(0.4f)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline)
            .padding(16.dp)
    ) {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("卷宗", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    GhostButton(text = "关闭", onClick = { viewModel.toggleDrawer(false) })
                }
            }

            if (board != null) {
                item { SectionLabel("显性属性") }
                items(board.attributes.entries.toList()) { (k, v) ->
                    DrawerRow(k, v.toInt().toString())
                }
                item { SectionLabel("朝堂态度") }
                items(board.court.entries.toList()) { (k, v) ->
                    DrawerRow(k, v.toInt().toString())
                }
                item { SectionLabel("隐情") }
                items(board.hidden.entries.toList()) { (k, v) ->
                    DrawerRow(k, v.toInt().toString())
                }
                item { SectionLabel("履历（倒序）") }
                items(board.history) { record ->
                    Text(text = record, style = MaterialTheme.typography.bodySmall, color = ParchmentDim)
                }
            }

            item { SectionLabel("结局图鉴") }
            items(state.codex) { entry ->
                DrawerRow(
                    label = if (entry.unlocked) entry.title ?: entry.id else "？？？",
                    value = if (entry.unlocked) "已得" else "未得"
                )
            }
        }
    }
}

@Composable
private fun DrawerRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = Gold)
    }
}
