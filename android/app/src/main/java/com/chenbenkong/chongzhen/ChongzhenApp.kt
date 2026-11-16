package com.chenbenkong.chongzhen

import android.app.Application
import com.chenbenkong.chongzhen.data.GameDataRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ============================================================================
// 应用入口：启动时一次性解析 assets/game-data.json 并缓存到 GameDataRepository。
// 发牌 / 判定热路径只读内存，不重复解析 3.9MB JSON。
// ============================================================================
class ChongzhenApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // 解析放后台线程，避免阻塞首帧；引擎在数据就绪前不发牌。
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                val json = assets.open("game-data.json").bufferedReader(Charsets.UTF_8).use { it.readText() }
                GameDataRepository.prime(GameDataRepository.parse(json))
            }
        }
    }
}
