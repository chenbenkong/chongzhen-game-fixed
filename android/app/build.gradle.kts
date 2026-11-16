// ============================================================================
// :app 模块构建脚本
// 包名 / namespace：com.chenbenkong.chongzhen
// compileSdk 35 / minSdk 26 / targetSdk 35
// 首版 debug/release 均关闭混淆（isMinifyEnabled=false），体积靠资源控制。
// ============================================================================
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.chenbenkong.chongzhen"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.chenbenkong.chongzhen"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.5.0"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            isShrinkResources = false
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            // 首版不配置签名（不提交 keystore、不写密码），仅保证可编译。
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    testOptions {
        unitTests {
            isReturnDefaultValues = true
            all {
                it.useJUnit()
            }
        }
    }
}

dependencies {
    // AndroidX 基础
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.3")

    // ViewModel 接线（状态在 ViewModel，旋转 / 进程重建不丢局）
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.3")

    // Compose BOM（版本统一由 BOM 2024.10.01 管理）
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // 序列化（数据层模型与存档）
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // JVM 单元测试（JUnit4）
    testImplementation("junit:junit:4.13.2")
}
