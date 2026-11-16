// ============================================================================
// 工程级设置：声明模块、插件仓库与依赖仓库。
// 包名 namespace 统一在 :app 的 build.gradle.kts 中声明。
// ============================================================================
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "ChongzhenNative"

include(":app")
