package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chenbenkong.chongzhen.ui.theme.Gold

/**
 * 可读错误页：JSON 解析失败 / 无事件可发 / 存档损坏等。
 * 不白屏、不崩溃；提供「重试」与「重新开始」两条出口。
 */
@Composable
fun ErrorScreen(state: UiState, viewModel: BoardViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "案卷有异",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = Gold
        )
        Text(
            text = state.error?.message ?: "发生未知错误。",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(top = 12.dp)
        )
        Column(
            modifier = Modifier.padding(top = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            PrimaryButton(text = "重 试", onClick = { viewModel.retryFromError() })
            GhostButton(text = "重新开始", onClick = { viewModel.restartFresh() })
        }
    }
}
