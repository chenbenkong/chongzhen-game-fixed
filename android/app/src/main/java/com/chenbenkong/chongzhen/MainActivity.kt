package com.chenbenkong.chongzhen

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
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
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // 横屏游戏壳：隐藏系统状态栏/导航栏，避免顶部出现一条纯黑空栏；
        // 从屏幕边缘上滑可临时呼出系统栏，不把返回手势彻底堵死。
        WindowCompat.setDecorFitsSystemWindows(window, false)
        // 6.83" 1.5K 这类带挖孔/刘海的横屏机型：允许内容铺到挖孔侧，
        // 渐变背景由 ScreenRoot 画满整屏，交互区再让出 safeDrawing。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        setContent {
            val viewModel: BoardViewModel = viewModel()
            AppRoot(viewModel)
        }
    }
}
