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

        // 隐藏属性：只反推成功效果里明确写出的正向道德值；没有就不凭空生成。
        // 失败一次善举不等于道德下降，失败一次阴谋也不等于野心上涨。
        hid["道德值"]?.let { v ->
            if (v > 0) failHid["道德值"] = -minOf(5.0, maxOf(2.0, ceil(v / 2).toDouble()))
        }

        // 兜底：成功效果全无正向属性时，失败折一点体质。
        val totalFail = failAttrs.values.sumOf { abs(it) } + failGs.values.sumOf { abs(it) }
        if (totalFail == 0.0) {
            failAttrs["体质"] = (failAttrs["体质"] ?: 0.0) - 2.0
        }

        return EventEffects(
            attributes = failAttrs.ifEmpty { null },
            gameState = failGs.ifEmpty { null },
            hidden = failHid.ifEmpty { null }
        )
    }

    /** 生成与当前事件不打架的失败回音（口径同 Web generateFailEcho）。 */
    fun generateFailEcho(
        choice: EventChoice,
        reasonText: String,
        conditionKey: String?,
        gap: Double?,
        event: GameEvent?
    ): FailEcho {
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
        val description = "因${lackingDescriptive}，强行为之，事情没能办成。"

        // 只看选项本身的动作，不把事件描述里的“军/兵/战/守”混进来。
        // 旧版用 eventDesc + choiceText 做关键词分类，一条“上疏请饷/护送太子/弹劾”
        // 的失败回音也会写成“你自恃能武，执意出战 / 兵卒折损数十”，与当前事件正面冲突。
        val action = choice.text ?: ""
        val intent = when {
            Regex("上疏|奏疏|弹章|弹劾|劾|具折|进谏|谏|廷议|廷争|朝会|请援|请饷|请恤|鸣冤|参本|揭发|自辩|附议|请旨|票拟|留中|封驳|召对|廷推|派系|党争|考成|考功|说情|认错|请罪|称病|告病|托病|卸差|上报|致书|政绩册|吏部|门生帖|条陈|力陈|三策|善后").containsMatchIn(action) -> "court"
            Regex("出战|出征|率军|领兵|迎战|守城|固守|死守|剿|突袭|追击|勤王|督战|阵前|平叛|兵变|劫营|驰援|接战|城防|武备|军务|以武|动武|用兵|弹压|请缨|主战|撤军|掘堤|水攻|诈降|反戈").containsMatchIn(action) -> "military"
            Regex("科举|会试|乡试|应试|讲学|著书|诗文|修史").containsMatchIn(action) -> "exam"
            Regex("囤|待价|待涨|货引|经商|商号|商贾|商户|商队|本钱|盐引|漕|榷|贿|贪|中饱|私囊|敛财|牟利|谋利|发财|捞取|虚报|浮报|克扣|截留|索贿|开价|明码标价|转卖|火耗|军械|抽头|包揽|冒领|趁火打劫|趁灾").containsMatchIn(action) -> "wealth"
            Regex("赈|救灾|济民|安民|减税|蠲|抚民|粥|开仓|平粜|流民|减免|散粮|放粮|加派").containsMatchIn(action) -> "relief"
            Regex("饷|军粮|军需|补给|转运|屯田|运粮|粮船|粮站|粮草|漕粮|供粮").containsMatchIn(action) -> "logistics"
            Regex("议和|谈判|出使|受抚|抚局|互市|遣使").containsMatchIn(action) -> "diplomacy"
            Regex("查案|查库|查办|查访|查缉|查问|彻查|审|案|狱|缉|捕|问刑|勘|鞫").containsMatchIn(action) -> "justice"
            Regex("婚|妻|妾|妻子|儿子|子女|家书|家宅|婚嫁|丧葬|葬|亲族|族人|亲人").containsMatchIn(action) -> "family"
            else -> "generic"
        }

        val body = when (intent) {
            "military" ->
                "你按“${choiceText.ifEmpty { "出战" }}”的法子调兵，奈何${lackingDescriptive}，号令不一、阵脚先乱；这一阵没能打出想要的结果。\n\n退下来清点，人马有折损，但未至溃散。部下虽未明言，眼底已有怨色。"
            "court" ->
                "你想在朝堂上把这件事推动下去，奈何${lackingDescriptive}，话递不上去，或当廷被顶了回来。\n\n风向未变，反把你的底牌露了；政敌们相视而笑，传言当晚便在京中衙门口传开。"
            "relief" ->
                "你想把赈济办实，奈何${lackingDescriptive}，粮款不继、分配生乱。\n\n百姓没得着实惠，反添怨言；此事被人参了一本，说你沽名钓誉、办事不力。"
            "exam" ->
                "你想在文墨上争一口气，奈何${lackingDescriptive}，文章与主张未被认可。\n\n同场士子以异样的目光看你，更有好事者当场赋诗讽之；你颜面尽失，原本有意结交的几位才子也悄然远离。"
            "justice" ->
                "你想把这桩案子办成铁案，奈何${lackingDescriptive}，口供翻覆、上下推诿。\n\n案子没结，反沾了一手灰；旁人开始躲着你，怕被这桩案子牵连。"
            "logistics" ->
                "你想把粮饷补给办妥，奈何${lackingDescriptive}，账目与转运都出了岔子。\n\n该到的钱粮迟了，营中怨气比先前更重；管粮的吏员互相推诿，最后只留下一本烂账。"
            "diplomacy" ->
                "你想在谈判桌上斡旋，奈何${lackingDescriptive}，被对方使节三言两语看穿了底牌。\n\n没占到便宜，反留下把柄；消息传回京城，主和派与主战派都拿你作话头。"
            "wealth" ->
                "你想在这笔钱上取利，奈何${lackingDescriptive}，账目露了破绽。\n\n利没落袋，反折了本；与你合伙的人开始撇清干系，官府那边也多了一双盯着你的眼睛。"
            "family" ->
                "你想把家里这桩事办妥，奈何${lackingDescriptive}，话说不到一处，反添嫌隙。\n\n亲近的人寒了心，外人看了笑话；这桩事此后成了家里谁也不愿再提的一根刺。"
            else ->
                "你想${choiceText.ifEmpty { "把这件事办成" }}，奈何${lackingDescriptive}，事情没按你的设想走。\n\n你原先指望的转机没有出现，反倒多了一层说不清的被动；此后每走一步，都得先看旁人的脸色。"
        }

        val gapHint = if (gap != null && gap > 0) {
            "\n\n（提示：${lackingKey.ifEmpty { conditionKey ?: "此项" }}还差约${gap.toInt()}点，待来日修为精进，或可一搏。）"
        } else ""

        val scene = event?.title?.takeIf { it.isNotEmpty() }?.let { "「${it}」这一桩，" } ?: ""
        val echo = "【回音】\n\n${scene}你想${choiceText.ifEmpty { "把这件事办成" }}，却因${lackingDescriptive}，没能如愿。\n\n${body}\n\n——事已至此，多想无益。${gapHint}"
        return FailEcho(title, description, echo)
    }
}
