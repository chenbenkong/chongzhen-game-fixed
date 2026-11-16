package com.chenbenkong.chongzhen.ui

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.chenbenkong.chongzhen.data.GameData
import com.chenbenkong.chongzhen.data.GameDataRepository
import com.chenbenkong.chongzhen.engine.save.SaveData
import com.chenbenkong.chongzhen.engine.save.SaveSerializer
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File

// ============================================================================
// 牌桌 ViewModel：持有 GameController，对接 Android 持久化（自动存档文件 / 图鉴 Prefs）。
// 游戏状态全部在 ViewModel 内，旋转 / 进程重建后可从自动存档恢复；Controller 本身纯 JVM，
// 单测可直接驱动。
// ============================================================================
class BoardViewModel(app: Application) : AndroidViewModel(app) {

    private val prefs = app.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val saveFile = File(app.filesDir, AUTOSAVE_NAME)

    private val _state = MutableStateFlow(UiState(screen = Screen.Loading))
    val uiState: StateFlow<UiState> = _state.asStateFlow()

    private var controller: GameController? = null

    /** 只读数据快照（标题 / 出身屏读难度、出身表）。 */
    val data: GameData? get() = controller?.data

    init {
        viewModelScope.launch {
            // 等待 Application 一次性解析 JSON；超时兜底进错误页，不许白屏死等。
            var waitedMs = 0L
            while (!GameDataRepository.isLoaded() && waitedMs < LOAD_TIMEOUT_MS) {
                delay(100)
                waitedMs += 100
            }
            if (!GameDataRepository.isLoaded()) {
                _state.update { it.copy(screen = Screen.FatalError, error = UiError.DataMissing) }
                return@launch
            }

            val data = GameDataRepository.get()
            val codexStore = PrefsCodexStore(prefs)
            val engineController = GameController(
                data = data,
                codex = codexStore,
                loadSave = { SaveSerializer.read(saveFile) },
                writeSave = { save: SaveData -> SaveSerializer.writeAtomic(saveFile, save) },
                deleteSave = { if (saveFile.exists()) saveFile.delete() }
            )
            controller = engineController
            engineController.enterTitle()
            viewModelScope.launch {
                engineController.state.collect { _state.value = it }
            }
        }
    }

    // ---- 标题 / 流程 ----

    fun setDifficulty(id: String) = controller?.setDifficulty(id)

    fun beginNewGame() = controller?.beginNewGame()

    fun continueGame() = controller?.continueGame()

    fun backToTitle() = controller?.backToTitle()

    fun restartFresh() = controller?.restartFresh()

    fun retryFromError() = controller?.retryFromError()

    // ---- 取名 ----

    fun updateDraft(transform: (NameDraft) -> NameDraft) = controller?.updateDraft(transform)

    fun randomizeName() = controller?.randomizeName()

    fun randomizeHometown() = controller?.randomizeHometown()

    /** @return 缺失字段提示；null 表示通过。 */
    fun confirmName(): String? = controller?.confirmName()

    // ---- 出身 / 牌桌 ----

    fun selectOrigin(originType: String) = controller?.selectOrigin(originType)

    fun choose(choiceId: String) = controller?.choose(choiceId)

    fun proceedAfterOutcome() = controller?.proceedAfterOutcome()

    fun advanceMonth() = controller?.advanceMonth()

    fun undo() = controller?.undo()

    fun saveNow() = controller?.saveNow()

    fun toggleDrawer(open: Boolean) = controller?.toggleDrawer(open)

    fun consumeToast() = controller?.consumeToast()

    companion object {
        private const val PREFS_NAME = "chongzhen_codex"
        private const val AUTOSAVE_NAME = "autosave.json"
        private const val LOAD_TIMEOUT_MS = 5_000L
    }
}

/** SharedPreferences -backed 图鉴存储（字符串集合）。 */
private class PrefsCodexStore(
    private val prefs: SharedPreferences
) : CodexStore {

    override fun unlocked(): Set<String> =
        prefs.getStringSet(KEY_UNLOCKED, emptySet()).orEmpty().toSet()

    override fun unlock(id: String) {
        val next = unlocked().toMutableSet()
        next.add(id)
        prefs.edit().putStringSet(KEY_UNLOCKED, next).apply()
    }

    companion object {
        private const val KEY_UNLOCKED = "unlocked_endings"
    }
}
