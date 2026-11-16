package com.chenbenkong.chongzhen.ui

// ============================================================================
// 展示层文案格式化：年号纪年、月名、结局品级 / 大类中文化、死亡归类。
// 纯展示口径，不参与玩法判定；归类关键词表对照 Web src/utils/endingSystem.ts。
// ============================================================================

private val CN_DIGITS = listOf("零", "一", "二", "三", "四", "五", "六", "七", "八", "九")

/** 1..99 阿拉伯数字 → 汉字数字。 */
fun toChineseNum(n: Int): String {
    if (n < 10) return CN_DIGITS[n]
    if (n < 20) return "十" + if (n % 10 == 0) "" else CN_DIGITS[n % 10]
    val tens = n / 10
    val ones = n % 10
    return CN_DIGITS[tens] + "十" + if (ones == 0) "" else CN_DIGITS[ones]
}

/** 西历年 → 明代年号纪年（元年用「元」）。 */
fun toMingEraYear(year: Int): String = when {
    year >= 1628 -> "崇祯" + if (year == 1628) "元" else toChineseNum(year - 1627) + "年"
    year >= 1621 -> "天启" + if (year == 1621) "元" else toChineseNum(year - 1620) + "年"
    year == 1620 -> "泰昌元年"
    year >= 1573 -> "万历" + if (year == 1573) "元" else toChineseNum(year - 1572) + "年"
    else -> toChineseNum(year) + "年"
}

private val MONTH_NAMES = listOf(
    "正月", "二月", "三月", "四月", "五月", "六月",
    "七月", "八月", "九月", "十月", "十一月", "腊月"
)

/** 月份 1..12 → 中文名。 */
fun monthName(month: Int): String = MONTH_NAMES.getOrElse(month - 1) { "${month}月" }

private val TIER_LABELS = mapOf(
    "legendary" to "传奇",
    "tragic" to "悲剧",
    "bittersweet" to "苦尽甘来",
    "dark" to "晦暗",
    "saintly" to "贤明",
    "controversial" to "争议",
    "mysterious" to "迷局",
    "good" to "善终",
    "bad" to "恶报",
    "normal" to "常局",
    "special" to "特殊"
)

/** 结局品级 tier → 中文；未知值原样返回。 */
fun tierLabel(tier: String?): String =
    tier?.let { TIER_LABELS[it] } ?: "常局"

private val CATEGORY_LABELS = mapOf(
    "official" to "仕途",
    "martyr" to "殉国",
    "hermit" to "隐逸",
    "gray" to "闲淡",
    "ming_fate" to "家国",
    "personal_fate" to "个人命途",
    "villain" to "奸佞",
    "special" to "特殊"
)

/** 结局大类 category → 中文；未知值原样返回。 */
fun categoryLabel(category: String?): String =
    category?.let { CATEGORY_LABELS[it] } ?: "命途"

/** 死亡结局 id 关键词（对照 Web endingSystem.ts isDeathEnding 正则）。 */
private val DEATH_KEYWORDS = listOf(
    "martyr", "zhaoyu", "died_battlefield", "southern_ming", "jiashen", "duty_death",
    "city_fall", "clan_exterminate", "death_illness", "bankrupt", "emperor_hate",
    "eunuch", "scholar_ostracism", "gentry_rebellion", "popular_uproar",
    "moral_degeneracy", "debauchery", "burning_death", "died_fighting", "whole_family",
    "traitor", "massacre", "frame_loyal", "inner_court_backlash"
)

/** 展示层归类：该结局是否为死亡结局（不改引擎判定）。 */
fun isDeathEnding(eventId: String): Boolean =
    DEATH_KEYWORDS.any { eventId.contains(it) }
