package com.chenbenkong.chongzhen.engine.effects

import com.chenbenkong.chongzhen.data.EventChoice
import com.chenbenkong.chongzhen.data.EventEffects
import com.chenbenkong.chongzhen.data.GameEvent
import kotlin.math.abs
import kotlin.math.ceil

// ============================================================================
// 投骰失败兜底：Web EventDisplay.deriveFailEffects / generateFailEcho 的原生移植。
// 选项未配 failEffects 时，按「成功时的效果」反推合理副作用；回音按事件 / 选项
// 关键词分类生成。引擎不写死「体质-2/道德-1」这类敷衍数据。
// ============================================================================

/** 生成的失败回音。 */
data class FailEcho(
    val title: String,
    val description: String,
    val echo: String
)

object FailFallback {

    /** 由成功效果反推失败副作用（口径同 Web deriveFailEffects）。 */
    fun deriveFailEffects(choice: EventChoice): EventEffects {
        val attrs = choice.effects.attributes ?: emptyMap()
        val gs = choice.effects.gameState ?: emptyMap()
        val hid = choice.effects.hidden ?: emptyMap()

        val failAttrs = mutableMapOf<String, Double>()
        val failGs = mutableMapOf<String, Double>()
        val failHid = mutableMapOf<String, Double>()

        attrs["体质"]?.let { v ->
            failAttrs["体质"] = if (v > 0) -minOf(5.0, maxOf(2.0, ceil(v / 2).toDouble()))
            else -minOf(8.0, maxOf(3.0, abs(v)))
        }
        attrs["财帛"]?.let { v ->
            if (v > 0) failAttrs["财帛"] = -minOf(8.0, maxOf(3.0, ceil(v / 2).toDouble()))
        }
        attrs["武略"]?.let { v ->
            if (v > 0) failAttrs["武略"] = -minOf(3.0, maxOf(1.0, ceil(v / 3).toDouble()))
        }
        attrs["理政"]?.let { v ->
            if (v > 0) failAttrs["理政"] = -minOf(3.0, maxOf(1.0, ceil(v / 3).toDouble()))
        }
        attrs["文韬"]?.let { v ->
            if (v > 0) failAttrs["文韬"] = -minOf(3.0, maxOf(1.0, ceil(v / 3).toDouble()))
        }

        gs["圣眷"]?.let { v -> if (v > 0) failGs["圣眷"] = -minOf(8.0, maxOf(3.0, ceil(v / 2).toDouble())) }
        gs["清议"]?.let { v -> if (v > 0) failGs["清议"] = -minOf(8.0, maxOf(3.0, ceil(v / 2).toDouble())) }
        gs["民望"]?.let { v -> if (v > 0) failGs["民望"] = -minOf(8.0, maxOf(3.0, ceil(v / 2).toDouble())) }
        gs["中官"]?.let { v -> if (v > 0) failGs["中官"] = -minOf(6.0, maxOf(2.0, ceil(v / 2).toDouble())) }

        failHid["道德值"] = hid["道德值"]?.let { v ->
            if (v > 0) -minOf(5.0, maxOf(2.0, ceil(v / 2).toDouble())) else -2.0
        } ?: -2.0
        failHid["野心值"] = hid["野心值"]?.let { v -> maxOf(2.0, ceil(abs(v) / 2 + 1)) } ?: 2.0

        // 兜底：成功效果全无正向属性时，失败折一点体质。
        val totalFail = failAttrs.values.sumOf { abs(it) } + failGs.values.sumOf { abs(it) }
        if (totalFail == 0.0) {
            failAttrs["体质"] = (failAttrs["体质"] ?: 0.0) - 2.0
        }

        return EventEffects(
            attributes = failAttrs.ifEmpty { null },
            gameState = failGs.ifEmpty { null },
            hidden = failHid
        )
    }

    /** 生成与事件 / 选项强相关的失败回音（口径同 Web generateFailEcho）。 */
    fun generateFailEcho(
        choice: EventChoice,
        reasonText: String,
        conditionKey: String?,
        gap: Double?,
        event: GameEvent?
    ): FailEcho {
        val eventDesc = event?.description ?: event?.narrative?.situation ?: ""
        val tagMatch = Regex("【([^】]+)】").find(choice.text ?: "")
        val choiceText = (tagMatch?.groupValues?.getOrNull(1) ?: choice.text ?: "").trim()

        val reasonTrimmed = reasonText.replace(Regex("(不足|差距|太低|欠缺)$"), "")
        val keyMatch = Regex("^([\\u4e00-\\u9fa5]{2,4})(?=[不足低欠差（(])").find(reasonTrimmed)
        val lackingKey = keyMatch?.groupValues?.getOrNull(1) ?: (conditionKey ?: "")

        val lackingDescriptive = when {
            lackingKey.isEmpty() -> "能力尚有欠缺"
            Regex("[文才学理墨笔]").containsMatchIn(lackingKey) -> "文才未逮"
            Regex("[武兵战勇力]").containsMatchIn(lackingKey) -> "武略生疏"
            Regex("[圣帝眷宠心]").containsMatchIn(lackingKey) -> "圣眷未孚"
            Regex("[中宦阉寺内官]").containsMatchIn(lackingKey) -> "内侍嫌隙"
            Regex("[清议士林言弹]").containsMatchIn(lackingKey) -> "清议责难"
            Regex("[民望乡里众舆]").containsMatchIn(lackingKey) -> "民望有亏"
            Regex("[绅豪地方族]").containsMatchIn(lackingKey) -> "乡绅掣肘"
            Regex("[体身疾病康]").containsMatchIn(lackingKey) -> "身体违和"
            Regex("[财银钱资库]").containsMatchIn(lackingKey) -> "资财短绌"
            Regex("[道德品行]").containsMatchIn(lackingKey) -> "德行有亏"
            else -> "${lackingKey}尚欠火候"
        }

        val title = "未能如愿 · ${choiceText.ifEmpty { "行动" }}"
        val description = "因${lackingDescriptive}，强行为之反遭其祸。"

        val hay = eventDesc + " " + choiceText
        val intro = if (eventDesc.isNotEmpty()) eventDesc.take(minOf(eventDesc.length, 60)) else "事情出了岔子"

        val body = when {
            Regex("[军兵战剿守边关匪贼]").containsMatchIn(hay) ->
                "你自恃能武，执意出战。无奈${lackingKey.ifEmpty { "武略" }}不济，阵脚大乱，反被对方看出破绽。\n\n兵卒折损数十，部下虽未明言，眼底颇有怨色。\n\n更糟的是，这一败让你的威严扫地，往后再要整军，只怕调遣不动。"
            Regex("[官朝政奏帝阉东林权党]").containsMatchIn(hay) ->
                "你欲在朝堂上翻云覆雨，无奈${lackingKey.ifEmpty { "根基" }}未稳，被对方一句话顶了回来。\n\n朝会散后，政敌们相视而笑，传言当晚便在京城各衙门口传开。\n\n你不仅没占到便宜，反而暴露出急于求成的底牌。"
            Regex("[考试举进士状元科举]").containsMatchIn(hay) ->
                "你自信才学，欲在科场上一搏。无奈${lackingKey.ifEmpty { "文才" }}欠火候，文章被考官批得体无完肤。\n\n同场士子皆以异样的目光看你，更有好事者当场赋诗讽之。\n\n你颜面尽失，原本有意结交的几位才子，也悄然远离。"
            Regex("[外使和贡边夷番]").containsMatchIn(hay) ->
                "你欲以外交手段斡旋，奈何${lackingKey.ifEmpty { "手腕" }}生疏，被对方使节三言两语便看穿了底牌。\n\n谈判未成，反被对方抓住了把柄，回国后还须向朝廷解释。\n\n消息传回京城，主和派借题发挥，让你处境愈发尴尬。"
            Regex("[灾民荒济赈赋税]").containsMatchIn(hay) ->
                "你心系灾民，急于赈济。无奈${lackingDescriptive}，筹到的米粮杯水车薪，分配时又生骚乱。\n\n流民非但没有领情，反而砸了你的施粥棚。\n\n此事被人参了一本，说你沽名钓誉、办事不力。"
            Regex("[士子闹落第落第举监学]").containsMatchIn(hay) ->
                "你欲以德化之、安抚之。无奈${lackingDescriptive}，群情激愤之下反被人揪住衣领质问。\n\n你仓皇退场，不仅平白折了脸面，事情也彻底闹大。\n\n更麻烦的是，落榜士子已将你视为眼中钉，日后再想施恩，怕是没人会领情。"
            else ->
                "你决意强行推动此事，无奈${lackingDescriptive}，结果与你的设想背道而驰。\n\n现场陷入一片尴尬的沉默。旁人的目光，让你恨不得掘地三尺。\n\n事后回想，其实若再等一等、准备更充分一些，未必不能成事。"
        }

        val gapHint = if (gap != null && gap > 0) {
            "\n\n（提示：${lackingKey.ifEmpty { conditionKey ?: "此项" }}还差约${gap.toInt()}点，待来日修为精进，或可一搏。）"
        } else ""

        val echo = "【回音】\n\n${intro}…\n\n${body}\n\n——事已至此，多想无益。${gapHint}"
        return FailEcho(title, description, echo)
    }
}
