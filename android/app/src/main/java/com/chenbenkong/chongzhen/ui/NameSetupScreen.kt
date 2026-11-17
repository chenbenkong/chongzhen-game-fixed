package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

import com.chenbenkong.chongzhen.ui.theme.Gold

// ============================================================================
// 取名屏：姓 / 名 / 字 / 年岁同一排，籍贯与随机抽同排，按钮同排。
// 不再放重复预览、不再占一整行返回键；整屏一屏填完。
// ============================================================================

@Composable
fun NameSetupScreen(state: UiState, viewModel: BoardViewModel) {
    var missingHint by remember { mutableStateOf<String?>(null) }
    val draft = state.draft

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Box(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "请 赐 名 字",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = Gold,
                modifier = Modifier.align(Alignment.Center)
            )
            GhostButton(
                text = "← 返回",
                onClick = { viewModel.backToTitle() },
                modifier = Modifier.align(Alignment.CenterEnd)
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = draft.surname,
                onValueChange = { v ->
                    missingHint = null
                    viewModel.updateDraft { it.copy(surname = v.take(2)) }
                },
                label = { Text("姓") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = draft.givenName,
                onValueChange = { v ->
                    missingHint = null
                    viewModel.updateDraft {
                        it.copy(givenName = v.take(2), autoCourtesy = true)
                    }
                },
                label = { Text("名") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = draft.courtesyName,
                onValueChange = { v ->
                    missingHint = null
                    viewModel.updateDraft { it.copy(courtesyName = v.take(2), autoCourtesy = false) }
                },
                label = { Text("字（可改）") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = draft.ageText,
                onValueChange = { v ->
                    missingHint = null
                    val cleaned = v.filter { it.isDigit() }.take(2)
                    viewModel.updateDraft { it.copy(ageText = cleaned) }
                },
                label = { Text("年岁 16-60") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = draft.hometown,
                onValueChange = { v ->
                    missingHint = null
                    viewModel.updateDraft { it.copy(hometown = v.take(14)) }
                },
                label = { Text("籍贯（如：南直隶苏州府吴县）") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            GhostButton(text = "随机抽", onClick = { viewModel.randomizeHometown() })
        }

        missingHint?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            GhostButton(
                text = "随机取名",
                onClick = {
                    missingHint = null
                    viewModel.randomizeName()
                },
                modifier = Modifier.weight(1f)
            )
            PrimaryButton(
                text = "定此名字",
                onClick = {
                    val missing = viewModel.confirmName()
                    if (missing != null) missingHint = missing
                },
                modifier = Modifier.weight(1f)
            )
        }
    }
}
