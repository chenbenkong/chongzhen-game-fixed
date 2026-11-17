package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.activity.compose.BackHandler
import com.chenbenkong.chongzhen.ui.theme.CardInk
import com.chenbenkong.chongzhen.ui.theme.CardInkDeep
import com.chenbenkong.chongzhen.ui.theme.CinnabarBright
import com.chenbenkong.chongzhen.ui.theme.Gold
import com.chenbenkong.chongzhen.ui.theme.GoldDark
import com.chenbenkong.chongzhen.ui.theme.PanelBorder
import com.chenbenkong.chongzhen.ui.theme.PanelBorderStrong
import com.chenbenkong.chongzhen.ui.theme.Parchment
import com.chenbenkong.chongzhen.ui.theme.ParchmentDim
import com.chenbenkong.chongzhen.ui.theme.ParchmentFaint

// ============================================================================
// 横屏牌桌：手机默认单栏，能力 / 态度 / 卷宗收进可开合抽屉。
//
//   顶部状态栏（年月 / 姓名 / 官职 / 国势 / 面板）
//   中栏：事件卡（标题 / 叙事 / 选项 / 结算）独占宽度
//   底部操作栏（返回 / 撤销 / 存档 / 进下月）
//   点「面板」→ 右侧抽屉，三个页签：能力 / 态度 / 卷宗
//
// 只有 ≥600dp 高的平板 / 桌面才常驻左右栏；手机寸土寸金，
// 默认把侧栏收起来，事件正文拿回整块宽度。
// 视觉仍按 Web 版 theme.css：墨黑渐变、宋体、旧金细线、方角面板。
// ============================================================================

private val PanelShape = RoundedCornerShape(3.dp)
private val PanelBg = Brush.verticalGradient(listOf(CardInk, CardInkDeep))

@Composable
fun BoardScreen(state: UiState, viewModel: BoardViewModel) {
    val board = state.board
    // 系统返回键：先收面板，再收底部操作条，都不直接退游戏。
    BackHandler(enabled = state.boardPanel != null || state.actionBarOpen) {
        if (state.boardPanel != null) viewModel.closeBoardPanel()
        else viewModel.setActionBarOpen(false)
    }
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            WebStatusBar(board, viewModel)
            state.banner?.let { BannerBar(it) }

            if (board != null) {
                MainArea(
                    state = state,
                    board = board,
                    viewModel = viewModel,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                )
            } else {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Text("案卷尚未展开", color = ParchmentDim)
                }
            }
        }

        if (state.actionBarOpen && board != null) {
            ActionBarScrim(onClose = { viewModel.setActionBarOpen(false) })
            BottomBar(
                state = state,
                viewModel = viewModel,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(6.dp),
                onClose = { viewModel.setActionBarOpen(false) }
            )
        }

        if (state.boardPanel != null && board != null) {
            PanelScrim(onClose = { viewModel.closeBoardPanel() })
            BoardPanelSheet(
                state = state,
                viewModel = viewModel,
                modifier = Modifier.align(Alignment.CenterEnd)
            )
        }
    }
}

// ---------------------------------------------------------------------- 顶部状态栏

@Composable
private fun WebStatusBar(
    board: BoardSnapshot?,
    viewModel: BoardViewModel
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(PanelShape)
            .background(Brush.verticalGradient(listOf(Color(0xFF18120A), Color(0xFF12100C))))
            .border(1.dp, PanelBorder, PanelShape)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (board == null) {
            Text("崇祯·宦海浮沉", style = MaterialTheme.typography.titleMedium, color = Gold)
            Spacer(Modifier.weight(1f))
            GhostButton(
                text = "面板",
                onClick = { viewModel.openBoardPanel(BoardPanel.Attributes) }
            )
            return@Row
        }

        Column(horizontalAlignment = Alignment.Start) {
            Text(
                text = toMingEraYear(board.year),
                style = MaterialTheme.typography.titleSmall,
                color = Gold,
                letterSpacing = 2.sp
            )
            Text(
                text = "${board.month}月",
                style = MaterialTheme.typography.labelMedium,
                color = ParchmentFaint
            )
        }
        VerticalRule()
        Column(horizontalAlignment = Alignment.Start) {
            Text(
                text = board.name,
                style = MaterialTheme.typography.bodyMedium,
                color = Parchment,
                letterSpacing = 2.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "年方${board.age}岁",
                style = MaterialTheme.typography.labelMedium,
                color = ParchmentFaint
            )
        }
        VerticalRule()
        Column(horizontalAlignment = Alignment.Start) {
            Text("官职", style = MaterialTheme.typography.labelMedium, color = ParchmentFaint)
            Box(
                modifier = Modifier
                    .clip(PanelShape)
                    .border(1.dp, PanelBorder, PanelShape)
                    .padding(horizontal = 6.dp, vertical = 1.dp)
            ) {
                Text(
                    text = board.rank,
                    style = MaterialTheme.typography.labelLarge,
                    color = Gold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        Spacer(Modifier.weight(1f))
        Text(
            text = "财帛 ${(board.attributes["财帛"] ?: 0.0).toInt()} · 体质 ${(board.attributes["体质"] ?: 0.0).toInt()}",
            style = MaterialTheme.typography.labelMedium,
            color = ParchmentFaint,
            maxLines = 1
        )
        Text(
            text = "国势 ${(board.court["国势"] ?: 0.0).toInt()}",
            style = MaterialTheme.typography.labelMedium,
            color = if ((board.court["国势"] ?: 0.0) < 35) CinnabarBright else Gold
        )
        GhostButton(
            text = "面板",
            onClick = { viewModel.openBoardPanel(BoardPanel.Attributes) }
        )
        GhostButton(
            text = if (board.pendingCount > 0) "操作 ${board.pendingCount + 1}" else "操作",
            onClick = { viewModel.setActionBarOpen(true) }
        )
    }
}

@Composable
private fun VerticalRule() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(22.dp)
            .background(
                Brush.verticalGradient(
                    listOf(Color.Transparent, PanelBorderStrong, Color.Transparent)
                )
            )
    )
}

// ---------------------------------------------------------------------- 主体区域

@Composable
private fun MainArea(
    state: UiState,
    board: BoardSnapshot,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier
) {
    BoxWithConstraints(modifier = modifier) {
        // 用横屏短边（高度）区分手机与平板：手机 366–426dp 一律单栏，
        // 侧栏从顶部「面板」按需打开；≥600dp 高的平板/桌面才常驻三栏。
        if (maxHeight >= 600.dp) {
            val sideWidth = (maxWidth * 0.21f).coerceIn(170.dp, 230.dp)
            Row(
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                AttributeSidebar(
                    board = board,
                    modifier = Modifier
                        .width(sideWidth)
                        .fillMaxHeight()
                )
                EventColumn(
                    state = state,
                    viewModel = viewModel,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                )
                StatusSidebar(
                    board = board,
                    modifier = Modifier
                        .width(sideWidth)
                        .fillMaxHeight()
                )
            }
        } else {
            EventColumn(
                state = state,
                viewModel = viewModel,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

// ---------------------------------------------------------------------- 左栏

@Composable
private fun AttributeSidebar(
    board: BoardSnapshot,
    modifier: Modifier = Modifier,
    chrome: Boolean = true
) {
    val panelModifier = if (chrome) {
        modifier
            .clip(PanelShape)
            .background(PanelBg)
            .border(1.dp, PanelBorder, PanelShape)
    } else {
        modifier
    }
    Column(
        modifier = panelModifier
            .padding(horizontal = 10.dp, vertical = 8.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        PanelTitle("个人能力")
        listOf("财帛", "文韬", "理政", "武略", "体质").forEach { key ->
            Meter(
                label = key,
                value = board.attributes[key] ?: 0.0,
                compact = true
            )
        }

        Spacer(Modifier.height(4.dp))
        PanelTitle("隐藏属性")
        listOf("道德值", "欲望值", "野心值", "机敏值", "忠诚值").forEach { key ->
            val value = board.hidden[key]
            if (value != null) {
                Meter(label = key, value = value, compact = true)
            }
        }

        Spacer(Modifier.height(4.dp))
        PanelTitle("官职")
        Text(
            text = board.rank,
            style = MaterialTheme.typography.bodyMedium,
            color = Gold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = "出身 · ${board.originName}",
            style = MaterialTheme.typography.labelMedium,
            color = ParchmentDim
        )
        Text(
            text = "政绩分 ${board.meritScore.toInt()}",
            style = MaterialTheme.typography.labelMedium,
            color = ParchmentFaint
        )
    }
}

@Composable
private fun StatusSidebar(
    board: BoardSnapshot,
    modifier: Modifier = Modifier,
    chrome: Boolean = true
) {
    val panelModifier = if (chrome) {
        modifier
            .clip(PanelShape)
            .background(PanelBg)
            .border(1.dp, PanelBorder, PanelShape)
    } else {
        modifier
    }
    Column(
        modifier = panelModifier
            .padding(horizontal = 10.dp, vertical = 8.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        PanelTitle("五方态度")
        listOf("圣眷", "中官", "清议", "士绅", "民望").forEach { key ->
            Meter(label = key, value = board.court[key] ?: 0.0, compact = true)
        }

        Spacer(Modifier.height(4.dp))
        PanelTitle("国势")
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("国势", style = MaterialTheme.typography.labelLarge, color = ParchmentDim)
            Text(
                text = (board.court["国势"] ?: 0.0).toInt().toString(),
                style = MaterialTheme.typography.titleMedium,
                color = if ((board.court["国势"] ?: 0.0) < 35) CinnabarBright else Gold
            )
        }
        Meter(label = "", value = board.court["国势"] ?: 0.0, showLabel = false, compact = true)

        Spacer(Modifier.height(4.dp))
        PanelTitle("政绩评定")
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("当前政绩分", style = MaterialTheme.typography.labelMedium, color = ParchmentFaint)
            Text(
                text = board.meritScore.toInt().toString(),
                style = MaterialTheme.typography.titleMedium,
                color = Gold
            )
        }
    }
}

// ---------------------------------------------------------------------- 中栏

@Composable
private fun EventColumn(
    state: UiState,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        EventCard(
            state = state,
            viewModel = viewModel,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        )
        if (state.outcomeVisible && state.outcome != null) {
            OutcomePanel(
                outcome = state.outcome,
                viewModel = viewModel,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 176.dp)
            )
        }
    }
}

@Composable
private fun EventCard(
    state: UiState,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier
) {
    val event = state.event
    var choicesOpen by remember(event) { mutableStateOf(false) }
    Column(
        modifier = modifier
            .clip(PanelShape)
            .background(PanelBg)
            .border(1.dp, PanelBorder, PanelShape)
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (event == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("（本月无事可奏）", color = ParchmentDim)
            }
            return@Column
        }

        EventHeader(
            title = event.title,
            choiceCount = state.choices.size,
            onOpenChoices = { choicesOpen = true }
        )

        event.narrative?.speaker?.takeIf { it.name.isNotBlank() }?.let { speaker ->
            NarrativeQuote(
                speaker = listOfNotNull(speaker.name, speaker.title).joinToString("·"),
                quote = event.narrative?.quote.orEmpty()
            )
        }

        if (event.description.isNotBlank()) {
            Text(
                text = event.description,
                style = MaterialTheme.typography.bodySmall,
                color = Parchment,
                lineHeight = 19.sp
            )
        }
        event.narrative?.background?.takeIf { it.isNotBlank() }?.let { bg ->
            Text(
                text = bg,
                style = MaterialTheme.typography.bodySmall,
                color = ParchmentDim,
                lineHeight = 18.sp
            )
        }
        event.narrative?.situation?.takeIf { it.isNotBlank() }?.let { sit ->
            Text(
                text = sit,
                style = MaterialTheme.typography.bodySmall,
                color = ParchmentDim,
                lineHeight = 18.sp
            )
        }

        if (!state.outcomeVisible && state.choices.isEmpty()) {
            Text("本事件暂无可选项。", style = MaterialTheme.typography.bodySmall, color = ParchmentDim)
        }
    }

    if (choicesOpen) {
        Dialog(
            onDismissRequest = { choicesOpen = false },
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(CardInkDeep)
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                Column(Modifier.fillMaxSize()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "本月抉择",
                            style = MaterialTheme.typography.titleMedium,
                            color = Gold,
                            letterSpacing = 3.sp,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            text = "${state.choices.size} 项",
                            style = MaterialTheme.typography.labelMedium,
                            color = ParchmentFaint
                        )
                        GhostButton(
                            text = "×",
                            onClick = { choicesOpen = false },
                            modifier = Modifier.padding(start = 8.dp)
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        state.choices.forEachIndexed { index, view ->
                            ChoiceCard(
                                index = index + 1,
                                view = view,
                                onClick = {
                                    choicesOpen = false
                                    viewModel.choose(view.choice.id)
                                }
                            )
                        }
                        if (state.choices.isEmpty()) {
                            Text("本事件暂无可选项。", style = MaterialTheme.typography.bodySmall, color = ParchmentDim)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EventHeader(title: String, choiceCount: Int, onOpenChoices: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(end = if (choiceCount > 0) 92.dp else 0.dp)
                .align(Alignment.Center),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(1.dp)
                    .background(
                        Brush.horizontalGradient(
                            listOf(Color.Transparent, PanelBorderStrong, Color.Transparent)
                        )
                    )
            )
            Text(
                text = "◆  $title  ◆",
                style = MaterialTheme.typography.headlineSmall,
                color = Color(0xFFD4A520),
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 10.dp)
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(1.dp)
                    .background(
                        Brush.horizontalGradient(
                            listOf(Color.Transparent, PanelBorderStrong, Color.Transparent)
                        )
                    )
            )
        }
        if (choiceCount > 0) {
            GhostButton(
                text = "选项 $choiceCount",
                onClick = onOpenChoices,
                modifier = Modifier.align(Alignment.CenterEnd)
            )
        }
    }
}

@Composable
private fun NarrativeQuote(speaker: String, quote: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(2.dp))
            .background(Color(0xFF100D09))
            .border(1.dp, PanelBorder, RoundedCornerShape(2.dp))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(2.dp))
                .border(1.dp, PanelBorderStrong, RoundedCornerShape(2.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text("奏", style = MaterialTheme.typography.labelLarge, color = GoldDark)
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(speaker, style = MaterialTheme.typography.labelMedium, color = Gold)
            if (quote.isNotBlank()) {
                Text(
                    text = "「$quote」",
                    style = MaterialTheme.typography.bodySmall,
                    color = ParchmentDim,
                    lineHeight = 18.sp
                )
            }
        }
    }
}

@Composable
private fun ChoiceCard(index: Int, view: ChoiceView, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 46.dp)
            .clip(PanelShape)
            .background(
                if (view.open) Brush.verticalGradient(listOf(Color(0xFF1A1510), Color(0xFF12100C)))
                else Brush.verticalGradient(listOf(Color(0xFF15120C), Color(0xFF0C0A07)))
            )
            .border(
                1.dp,
                if (view.open) PanelBorderStrong else PanelBorder,
                PanelShape
            )
            .clickable(enabled = view.open, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(RoundedCornerShape(2.dp))
                .border(1.dp, if (view.open) GoldDark else PanelBorder, RoundedCornerShape(2.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = index.toString(),
                style = MaterialTheme.typography.labelMedium,
                color = if (view.open) Gold else ParchmentFaint
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = view.choice.text,
                style = MaterialTheme.typography.bodySmall,
                color = if (view.open) Parchment else ParchmentFaint,
                lineHeight = 17.sp
            )
            view.choice.description?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelLarge,
                    color = ParchmentFaint,
                    lineHeight = 16.sp
                )
            }
            if (!view.open) {
                Text(
                    text = "锁 · ${view.disabledReason ?: "条件未满足"}",
                    style = MaterialTheme.typography.labelMedium,
                    color = CinnabarBright
                )
            }
        }
    }
}

@Composable
private fun OutcomePanel(
    outcome: OutcomeView,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(PanelShape)
            .background(PanelBg)
            .border(1.dp, PanelBorderStrong, PanelShape)
            .padding(horizontal = 10.dp, vertical = 7.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        outcome.outcome.resultTitle?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = Gold
            )
        }

        val chips = mutableListOf<String>()
        outcome.attrDeltas.forEach { (k, v) -> chips += "$k ${formatDelta(v)}" }
        outcome.stateDeltas.forEach { (k, v) -> chips += "$k ${formatDelta(v)}" }
        outcome.hiddenDeltas.forEach { (k, v) -> chips += "$k ${formatDelta(v)}" }
        if (chips.isNotEmpty()) {
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                chips.forEach { chip ->
                    DeltaChip(text = chip, positive = !chip.contains("-"))
                }
            }
        }
        (outcome.addedFlags + outcome.removedFlags).take(4).forEach { flag ->
            Text("票 · $flag", style = MaterialTheme.typography.labelMedium, color = ParchmentFaint)
        }
        outcome.outcome.resultEcho?.takeIf { it.isNotBlank() }?.let { echo ->
            Text(
                text = echo,
                style = MaterialTheme.typography.bodyMedium,
                color = Parchment,
                lineHeight = 19.sp
            )
        }
        PrimaryButton(
            text = "继 续",
            onClick = { viewModel.proceedAfterOutcome() },
            modifier = Modifier.fillMaxWidth()
        )
    }
}

// ---------------------------------------------------------------------- 底部操作栏

@Composable
private fun BottomBar(
    state: UiState,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier,
    onClose: () -> Unit
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(PanelShape)
            .background(Brush.verticalGradient(listOf(Color(0xFF18130D), Color(0xFF12100C))))
            .border(1.dp, PanelBorder, PanelShape)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        state.board?.let { board ->
            Text(
                text = "第${board.turn}回合",
                style = MaterialTheme.typography.labelMedium,
                color = ParchmentFaint
            )
            if (board.pendingCount > 0) {
                Text(
                    text = "待办 ${board.pendingCount + 1}",
                    style = MaterialTheme.typography.labelMedium,
                    color = Gold
                )
            }
        }
        Box(modifier = Modifier.weight(1f))
        state.advanceBlockedReason?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium,
                color = ParchmentFaint,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        GhostButton(
            text = "返回",
            onClick = {
                onClose()
                viewModel.backToTitle()
            }
        )
        GhostButton(
            text = "撤销",
            onClick = {
                onClose()
                viewModel.undo()
            }
        )
        GhostButton(
            text = "存档",
            onClick = {
                onClose()
                viewModel.saveNow()
            }
        )
        PrimaryButton(
            text = "进下月",
            onClick = {
                onClose()
                viewModel.advanceMonth()
            },
            enabled = state.advanceBlockedReason == null && state.board != null
        )
        GhostButton(text = "×", onClick = onClose)
    }
}

@Composable
private fun BannerBar(banner: BannerView) {
    val accent = when (banner.kind) {
        BannerKind.Promotion -> Gold
        BannerKind.Demotion -> CinnabarBright
        BannerKind.Crisis -> CinnabarBright
        BannerKind.Info -> GoldDark
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(accent.copy(alpha = 0.12f))
            .border(1.dp, accent.copy(alpha = 0.35f), PanelShape)
            .padding(horizontal = 10.dp, vertical = 3.dp)
    ) {
        Text(
            text = banner.text,
            style = MaterialTheme.typography.labelLarge,
            color = Parchment
        )
    }
}

// ---------------------------------------------------------------------- 小件

@Composable
private fun PanelTitle(text: String) {
    Text(
        text = text,
        modifier = Modifier.fillMaxWidth(),
        style = MaterialTheme.typography.titleSmall,
        color = Gold,
        textAlign = TextAlign.Center,
        letterSpacing = 2.sp
    )
}

@Composable
private fun Meter(
    label: String,
    value: Double,
    showLabel: Boolean = true,
    compact: Boolean = false
) {
    val safe = value.coerceIn(0.0, 100.0)
    val barColor = when {
        safe <= 0 -> CinnabarBright
        safe <= 10 -> CinnabarBright
        safe <= 25 -> GoldDark
        else -> Gold
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        if (showLabel) {
            Text(
                text = label,
                modifier = Modifier.width(if (compact) 38.dp else 46.dp),
                style = MaterialTheme.typography.labelMedium,
                color = ParchmentDim,
                maxLines = 1
            )
        }
        Box(
            modifier = Modifier
                .weight(1f)
                .height(4.dp)
                .clip(RoundedCornerShape(1.dp))
                .background(Color(0xFF050403))
                .border(1.dp, PanelBorder, RoundedCornerShape(1.dp))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth((safe / 100.0).toFloat())
                    .fillMaxHeight()
                    .background(barColor)
            )
        }
        Text(
            text = safe.toInt().toString(),
            modifier = Modifier.width(if (compact) 24.dp else 30.dp),
            style = MaterialTheme.typography.labelMedium,
            color = if (safe <= 25) CinnabarBright else Parchment,
            textAlign = TextAlign.End
        )
    }
}

private fun formatDelta(v: Double): String {
    val n = v.toInt()
    return if (n >= 0) "+$n" else n.toString()
}

// ---------------------------------------------------------------------- 浮动操作条

@Composable
private fun ActionBarScrim(onClose: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.22f))
            .clickable(onClick = onClose)
    )
}

// ---------------------------------------------------------------------- 面板抽屉

@Composable
private fun PanelScrim(onClose: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.55f))
            .clickable(onClick = onClose)
    )
}

/** 手机牌桌的按需面板：能力 / 态度 / 卷宗，三个页签共用一块抽屉。 */
@Composable
private fun BoardPanelSheet(
    state: UiState,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier
) {
    val board = state.board ?: return
    val selected = state.boardPanel ?: BoardPanel.Attributes
    Column(
        modifier = modifier
            .fillMaxHeight()
            .fillMaxWidth(0.64f)
            .clip(PanelShape)
            .background(PanelBg)
            .border(1.dp, PanelBorderStrong, PanelShape)
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "面板",
                style = MaterialTheme.typography.titleMedium,
                color = Gold,
                letterSpacing = 2.sp
            )
            GhostButton(text = "关闭", onClick = { viewModel.closeBoardPanel() })
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            BoardPanel.values().forEach { panel ->
                PanelTab(
                    text = boardPanelLabel(panel),
                    selected = panel == selected,
                    onClick = { viewModel.openBoardPanel(panel) },
                    modifier = Modifier.weight(1f)
                )
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(top = 6.dp)
        ) {
            when (selected) {
                BoardPanel.Attributes -> AttributeSidebar(
                    board = board,
                    modifier = Modifier.fillMaxSize(),
                    chrome = false
                )
                BoardPanel.Status -> StatusSidebar(
                    board = board,
                    modifier = Modifier.fillMaxSize(),
                    chrome = false
                )
                BoardPanel.Records -> RecordsPanel(
                    board = board,
                    codex = state.codex,
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}

@Composable
private fun PanelTab(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
            Box(
        modifier = modifier
            .heightIn(min = 40.dp)
            .clip(PanelShape)
            .background(if (selected) Color(0xFF221A10) else Color.Transparent)
            .border(
                1.dp,
                if (selected) GoldDark else PanelBorder,
                PanelShape
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) Gold else ParchmentDim,
            letterSpacing = 1.sp
        )
    }
}

private fun boardPanelLabel(panel: BoardPanel): String = when (panel) {
    BoardPanel.Attributes -> "能力"
    BoardPanel.Status -> "态度"
    BoardPanel.Records -> "卷宗"
}

@Composable
private fun RecordsPanel(
    board: BoardSnapshot,
    codex: List<CodexEntry>,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        SectionLabel("票签")
        if (board.flags.isEmpty()) {
            Text("暂无票签。", style = MaterialTheme.typography.bodySmall, color = ParchmentDim)
        } else {
            board.flags.forEach { flag ->
                Text("· $flag", style = MaterialTheme.typography.bodySmall, color = ParchmentDim)
            }
        }

        SectionLabel("履历")
        if (board.history.isEmpty()) {
            Text("尚无履历。", style = MaterialTheme.typography.bodySmall, color = ParchmentDim)
        } else {
            board.history.forEach { record ->
                Text(record, style = MaterialTheme.typography.bodySmall, color = ParchmentDim)
            }
        }

        SectionLabel("结局图鉴")
        codex.forEach { entry ->
            DrawerRow(
                label = if (entry.unlocked) entry.title ?: entry.id else "？？？",
                value = if (entry.unlocked) "已得" else "未得"
            )
        }
    }
}

@Composable
private fun DrawerRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = ParchmentDim)
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = Gold)
    }
}
