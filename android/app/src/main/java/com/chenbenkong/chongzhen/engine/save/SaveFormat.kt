package com.chenbenkong.chongzhen.engine.save

import com.chenbenkong.chongzhen.engine.state.CharacterState
import com.chenbenkong.chongzhen.engine.state.GameStateValues
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import kotlin.io.path.readText
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.deleteIfExists
import kotlin.io.path.writeText

// ============================================================================
// 存档格式：一局状态的完整 JSON 序列化 / 反序列化。
// schemaVersion 预留迁移分支；当前版本 4，与 Web SaveData 口径对齐。
// 写入走「临时文件 + 原子替换」，避免写到一半崩溃留下半截坏档。
// ============================================================================

const val SAVE_SCHEMA_VERSION = 4

@Serializable
data class SaveData(
    val schemaVersion: Int = SAVE_SCHEMA_VERSION,
    val savedAt: String = "",
    val playerName: String = "",
    val origin: String = "",
    val degree: String = "进士",
    val identityType: String = "official",
    val difficulty: String = "normal",
    val character: CharacterState,
    val gameState: GameStateValues,
    val eventHistory: List<String> = emptyList(),
    val currentEventId: String? = null,
    val pendingEventIds: List<String> = emptyList(),
    val lastTurnById: Map<String, Int> = emptyMap(),
    val currentStoryline: String? = null,
    val meritBonus: Double = 0.0,
    val meritScore: Double = 0.0,
    val previousMeritScore: Double = 0.0
)

object SaveSerializer {

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        encodeDefaults = true
    }

    fun toJson(data: SaveData): String = json.encodeToString(SaveData.serializer(), data)

    fun fromJson(text: String): SaveData = json.decodeFromString(SaveData.serializer(), text)

    /**
     * 原子写入：先写到同目录临时文件，再移动覆盖目标文件。
     * @return true 写入成功；false 解析/IO 失败由调用方记录。
     */
    fun writeAtomic(target: Path, data: SaveData): Boolean {
        return try {
            val temp = target.resolveSibling("${target.fileName}.tmp")
            temp.writeText(toJson(data), Charsets.UTF_8)
            try {
                Files.move(temp, target, java.nio.file.StandardCopyOption.ATOMIC_MOVE)
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(temp, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
            }
            true
        } catch (e: Exception) {
            target.resolveSibling("${target.fileName}.tmp").deleteIfExists()
            false
        }
    }

    fun read(target: Path): SaveData? = try {
        if (!Files.exists(target)) null
        else fromJson(target.readText(Charsets.UTF_8))
    } catch (e: Exception) {
        null
    }

    /** [File] 重载：供 Android 私有目录直接传 File。 */
    fun read(file: File): SaveData? = read(file.toPath())

    /** [File] 重载：供 Android 私有目录直接传 File。 */
    fun writeAtomic(file: File, data: SaveData): Boolean = writeAtomic(file.toPath(), data)
}
