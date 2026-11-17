package com.chenbenkong.chongzhen.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.chenbenkong.chongzhen.R

/**
 * 原生 APK 的背景音乐。
 *
 * 网页版是 <audio>；这里是 MediaPlayer + res/raw/bgm.mp3。
 * 默认开、循环、0.4 音量，并在 Activity 前后台切换时暂停/恢复。
 * 任何播放失败都只记在 [errorMessage] 里，不阻塞游戏。
 */
object BgmPlayer {
    private const val PREFS = "chongzhen"
    private const val KEY_ENABLED = "bgm_on"
    private const val VOLUME = 0.4f
    private const val DUCK_VOLUME = 0.12f

    private var appContext: Context? = null
    private var mediaPlayer: MediaPlayer? = null
    private var audioManager: AudioManager? = null
    private var focusRequest: AudioFocusRequest? = null
    private var pausedForFocus = false

    var isEnabled by mutableStateOf(true)
        private set

    var errorMessage by mutableStateOf("")
        private set

    /** 在 Activity.onCreate 调一次；只持有 applicationContext。 */
    fun attach(context: Context) {
        val app = context.applicationContext
        appContext = app
        audioManager = app.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        isEnabled = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_ENABLED, true)
        if (isEnabled) play()
    }

    /** Activity.onResume：如果玩家开着音乐，回到前台继续。 */
    fun onResume() {
        if (isEnabled) play()
    }

    /** Activity.onPause：暂停并让出音频焦点；回前台再重新申请。 */
    fun onPause() {
        runCatching { mediaPlayer?.takeIf { it.isPlaying }?.pause() }
        abandonFocus()
    }

    /** 标题屏 / 牌桌里的开关。 */
    fun toggle() {
        isEnabled = !isEnabled
        appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            ?.edit()
            ?.putBoolean(KEY_ENABLED, isEnabled)
            ?.apply()

        if (isEnabled) {
            play()
        } else {
            runCatching { mediaPlayer?.takeIf { it.isPlaying }?.pause() }
            abandonFocus()
            errorMessage = ""
        }
    }

    /** Activity 真正结束时释放 MediaPlayer。 */
    fun release() {
        abandonFocus()
        runCatching { mediaPlayer?.release() }
        mediaPlayer = null
        focusRequest = null
        appContext = null
        audioManager = null
    }

    private fun play() {
        val context = appContext ?: return
        val player = ensurePlayer(context) ?: return

        if (!requestFocus()) {
            // 拿不到音频焦点也不拦游戏；部分 ROM 会直接拒绝，但仍然可以播。
            errorMessage = "无法获取音频焦点"
        }

        runCatching {
            player.setVolume(VOLUME, VOLUME)
            if (!player.isPlaying) player.start()
            errorMessage = ""
        }.onFailure {
            errorMessage = "背景音乐播放失败：${it.message ?: "未知原因"}"
        }
    }

    private fun ensurePlayer(context: Context): MediaPlayer? {
        mediaPlayer?.let { return it }
        return runCatching {
            MediaPlayer.create(context, R.raw.bgm).apply {
                isLooping = true
                setVolume(VOLUME, VOLUME)
            }
        }.onSuccess {
            mediaPlayer = it
            errorMessage = ""
        }.onFailure {
            errorMessage = "背景音乐加载失败：${it.message ?: "未知原因"}"
        }.getOrNull()
    }

    private fun requestFocus(): Boolean {
        val manager = audioManager ?: return true
        focusRequest?.let { existing ->
            return manager.requestAudioFocus(existing) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(attributes)
            .setOnAudioFocusChangeListener { change ->
                when (change) {
                    AudioManager.AUDIOFOCUS_LOSS -> {
                        pausedForFocus = false
                        runCatching { mediaPlayer?.takeIf { it.isPlaying }?.pause() }
                    }

                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                        pausedForFocus = true
                        runCatching { mediaPlayer?.takeIf { it.isPlaying }?.pause() }
                    }

                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                        runCatching { mediaPlayer?.setVolume(DUCK_VOLUME, DUCK_VOLUME) }
                    }

                    AudioManager.AUDIOFOCUS_GAIN -> {
                        runCatching { mediaPlayer?.setVolume(VOLUME, VOLUME) }
                        if (pausedForFocus) {
                            pausedForFocus = false
                            runCatching {
                                mediaPlayer?.takeIf { !it.isPlaying }?.start()
                            }
                        }
                    }
                }
            }
            .build()

        focusRequest = request
        return manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    private fun abandonFocus() {
        val manager = audioManager ?: return
        focusRequest?.let { manager.abandonAudioFocusRequest(it) }
        focusRequest = null
    }
}
