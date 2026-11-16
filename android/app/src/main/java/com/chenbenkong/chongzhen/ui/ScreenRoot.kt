package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.collectAsState
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import com.chenbenkong.chongzhen.ui.theme.BoardTheme
import kotlinx.coroutines.delay

/**
 * 应用根路由：按 [UiState.screen] 分发到各原生 Compose 界面。
 * 安全区由根节点统一 inset；所有屏幕不另起套壳、不依赖 hover。
 */
@Composable
fun AppRoot(viewModel: BoardViewModel) {
    val state by viewModel.uiState.collectAsState()

    BoardTheme {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars),
            color = MaterialTheme.colorScheme.background
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                when (state.screen) {
                    Screen.Loading -> LoadingScreen()
                    Screen.Title -> TitleScreen(state, viewModel)
                    Screen.NameForm -> NameSetupScreen(state, viewModel)
                    Screen.Origin -> OriginSelectScreen(state, viewModel)
                    Screen.Board -> BoardScreen(state, viewModel)
                    Screen.Ending -> EndingScreen(state, viewModel)
                    Screen.FatalError -> ErrorScreen(state, viewModel)
                }

                state.toast?.let { toast ->
                    ToastOverlay(
                        text = toast,
                        modifier = Modifier.align(Alignment.BottomCenter)
                    )
                    LaunchedEffect(toast) {
                        delay(1800)
                        viewModel.consumeToast()
                    }
                }
            }
        }
    }
}

/** 加载态：等待 Application 解析 assets/game-data.json。 */
@Composable
private fun LoadingScreen() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        androidx.compose.foundation.layout.Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            Text(
                text = "正在展开案卷…",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

/** 轻提示浮层。 */
@Composable
private fun ToastOverlay(text: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .padding(bottom = 24.dp)
            .padding(horizontal = 24.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        Text(text = text, style = MaterialTheme.typography.bodyMedium)
    }
}
