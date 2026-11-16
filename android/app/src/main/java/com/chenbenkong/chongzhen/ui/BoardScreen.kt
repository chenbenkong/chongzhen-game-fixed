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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.chenbenkong.chongzhen.ui.theme.CardInk
import com.chenbenkong.chongzhen.ui.theme.CardInkDeep
import com.chenbenkong.chongzhen.ui.theme.Cinnabar
import com.chenbenkong.chongzhen.ui.theme.CinnabarBright
import com.chenbenkong.chongzhen.ui.theme.Gold
import com.chenbenkong.chongzhen.ui.theme.GoldDark
import com.chenbenkong.chongzhen.ui.theme.PanelBorder
import com.chenbenkong.chongzhen.ui.theme.PanelBorderStrong
import com.chenbenkong.chongzhen.ui.theme.Parchment
import com.chenbenkong.chongzhen.ui.theme.ParchmentDim
import com.chenbenkong.chongzhen.ui.theme.ParchmentFaint

// ============================================================================
// 横屏牌桌：按 Web 版的三栏骨架重排。
//
//   顶部状态栏（年月 / 姓名 / 官职 / 回合）
//   ├─ 左栏：个人能力 + 隐藏属性 + 官职出身
//   ├─ 中栏：事件卡（标题 / 叙事 / 选项 / 结算）
//   └─ 右栏：五方态度 + 国势 + 政绩
//   底部操作栏（返回 / 撤销 / 存档 / 进下月）
//
// 视觉也按 Web 版 theme.css 收敛：墨黑渐变底、宋体、旧金细线、
// 方角低圆角面板；不再用 Material 默认的 Roboto 与圆角胶囊。
// ============================================================================

private val PanelShape = RoundedCornerShape(3.dp)
private val PanelBg = Brush.verticalGradient(listOf(CardInk, CardInkDeep))

@Composable
fun BoardScreen(state: UiState, viewModel: BoardViewModel) {
    val board = state.board
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            WebStatusBar(board, state, viewModel)
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

            BottomBar(state, viewModel)
        }

        if (state.drawerOpen) {
            DrawerScrim(onClose = { viewModel.toggleDrawer(false) })
            BoardDrawer(state, viewModel, modifier = Modifier.align(Alignment.CenterEnd))
        }
    }
}

// ---------------------------------------------------------------------- 顶部状态栏

@Composable
private fun WebStatusBar(
    board: BoardSnapshot?,
    state: UiState,
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
            GhostButton(text = "卷宗", onClick = { viewModel.toggleDrawer(true) })
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
        GhostButton(text = "卷宗", onClick = { viewModel.toggleDrawer(true) })
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

// ---------------------------------------------------------------------- 主体三栏

@Composable
private fun MainArea(
    state: UiState,
    board: BoardSnapshot,
    viewModel: BoardViewModel,
    modifier: Modifier = Modifier
) {
    BoxWithConstraints(modifier = modifier) {
        val showSidebars = maxWidth >= 600.dp
        if (showSidebars) {
            val sideWidth = (maxWidth * 0.21f).coerceIn(150.dp, 220.dp)
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
            Column(modifier = Modifier.fillMaxSize()) {
                EventColumn(
                    state = state,
                    viewModel = viewModel,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 92.dp)
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    AttributeSidebar(board = board, modifier = Modifier.width(220.dp))
                    StatusSidebar(board = board, modifier = Modifier.width(220.dp))
                }
            }
        }
    }
}

// ---------------------------------------------------------------------- 左栏

@Composable
private fun AttributeSidebar(board: BoardSnapshot, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(PanelShape)
            .background(PanelBg)
            .border(1.dp, PanelBorder, PanelShape)
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
private fun StatusSidebar(board: BoardSnapshot, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(PanelShape)
            .background(PanelBg)
            .border(1.dp, PanelBorder, PanelShape)
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

        EventHeader(event.title, state.board?.pendingCount ?: 0)

        event.narrative?.speaker?.takeIf { it.name.isNotBlank() }?.let { speaker ->
            NarrativeQuote(
                speaker = listOfNotNull(speaker.name, speaker.title).joinToString("·"),
                quote = event.narrative?.quote.orEmpty()
            )
        }

        if (event.description.isNotBlank()) {
            Text(
                text = event.description,
                style = MaterialTheme.typography.bodyMedium,
                color = Parchment,
                lineHeight = 21.sp
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

        if (!state.outcomeVisible) {
            Spacer(Modifier.height(2.dp))
            state.choices.forEachIndexed { index, view ->
                ChoiceCard(
                    index = index + 1,
                    view = view,
                    onClick = { viewModel.choose(view.choice.id) }
                )
            }
            if (state.choices.isEmpty()) {
                Text("本事件暂无可选项。", style = MaterialTheme.typography.bodySmall, color = ParchmentDim)
            }
        }
    }
}

@Composable
private fun EventHeader(title: String, pending: Int) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
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
        if (pending > 0) {
            Text(
                text = "本月尚有 ${pending + 1} 个事件待处理",
                style = MaterialTheme.typography.labelMedium,
                color = ParchmentFaint,
                modifier = Modifier.padding(top = 3.dp)
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
                    style = MaterialTheme.typography.bodyMedium,
                    color = ParchmentDim,
                    lineHeight = 19.sp
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
                style = MaterialTheme.typography.bodyMedium,
                color = if (view.open) Parchment else ParchmentFaint,
                lineHeight = 18.sp
            )
            view.choice.description?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
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
private fun BottomBar(state: UiState, viewModel: BoardViewModel) {
    Row(
        modifier = Modifier
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
        GhostButton(text = "返回", onClick = { viewModel.backToTitle() })
        GhostButton(text = "撤销", onClick = { viewModel.undo() })
        GhostButton(text = "存档", onClick = { viewModel.saveNow() })
        PrimaryButton(
            text = "进下月",
            onClick = { viewModel.advanceMonth() },
            enabled = state.advanceBlockedReason == null && state.board != null
        )
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

// ---------------------------------------------------------------------- 抽屉

@Composable
private fun DrawerScrim(onClose: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.55f))
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
            .fillMaxWidth(0.52f)
            .background(PanelBg)
            .border(1.dp, PanelBorderStrong)
            .padding(12.dp)
    ) {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "卷宗",
                        style = MaterialTheme.typography.titleMedium,
                        color = Gold,
                        letterSpacing = 2.sp
                    )
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
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = ParchmentDim)
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = Gold)
    }
}
