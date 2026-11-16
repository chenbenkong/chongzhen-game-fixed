package com.chenbenkong.chongzhen.ui

import androidx.compose.foundation.layout.Arrangement
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
import com.chenbenkong.chongzhen.ui.theme.ParchmentDim

// ============================================================================
// 取名屏：姓 / 名 / 字 / 年岁 / 籍贯，字段与 Web 版一致。
// 字随名自动生成（可手改，手改后停止自动覆盖）；籍贯可随机抽。
// ============================================================================

@Composable
fun NameSetupScreen(state: UiState, viewModel: BoardViewModel) {
    var missingHint by remember { mutableStateOf<String?>(null) }
    val draft = state.draft

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "请 赐 名 字",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
        Text(
            text = "「名以正体，字以表德。」",
            style = MaterialTheme.typography.bodyLarge,
            color = ParchmentDim
        )

        Row(
            modifier = Modifier.fillMaxWidth(0.8f),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
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
        }

        Row(
            modifier = Modifier.fillMaxWidth(0.8f),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            OutlinedTextField(
                value = draft.courtesyName,
                onValueChange = { v ->
                    missingHint = null
                    viewModel.updateDraft { it.copy(courtesyName = v.take(2), autoCourtesy = false) }
                },
                label = { Text("字（按名生成，可改）") },
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
                label = { Text("年岁（16-60）") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(0.8f),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
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

        // 预览
        val preview = when {
            draft.fullName.isBlank() -> "请输入姓名"
            else -> buildString {
                append("阁下：").append(draft.fullName)
                if (draft.courtesyName.isNotBlank()) append("，字").append(draft.courtesyName)
                if (draft.age in 16..60) append("，年").append(draft.age)
                if (draft.hometown.isNotBlank()) append("，").append(draft.hometown).append("人")
            }
        }
        Text(text = preview, style = MaterialTheme.typography.bodyLarge, color = Gold)

        missingHint?.let {
            Text(text = it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }

        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            GhostButton(text = "随机取名", onClick = {
                missingHint = null
                viewModel.randomizeName()
            })
            PrimaryButton(text = "定此名字", onClick = {
                val missing = viewModel.confirmName()
                if (missing != null) missingHint = missing
            })
        }

        GhostButton(text = "← 返回", onClick = { viewModel.backToTitle() })
    }
}
