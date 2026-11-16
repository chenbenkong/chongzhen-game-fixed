package com.chenbenkong.chongzhen

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.chenbenkong.chongzhen.ui.AppRoot
import com.chenbenkong.chongzhen.ui.BoardViewModel

/**
 * 应用唯一入口 Activity。
 *
 * 职责：
 * 1. 开启 edge-to-edge 全屏；横屏锁定已在 AndroidManifest 中声明；
 * 2. 挂载原生 Compose 牌桌根路由 [AppRoot]，游戏状态由 [BoardViewModel] 持有；
 * 3. 本类不持有任何 WebView / 网页套壳，全部渲染为原生 Compose。
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        setContent {
            val viewModel: BoardViewModel = viewModel()
            AppRoot(viewModel)
        }
    }
}
