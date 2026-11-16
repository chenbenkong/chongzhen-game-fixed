// ============================================================================
// 根工程构建脚本：只声明插件版本，不做任何模块级配置。
// 版本组合（固定，勿随意升降）：
//   AGP 8.7.3 / Kotlin 2.0.21 / Compose BOM 2024.10.01
// ============================================================================
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.21" apply false
}
