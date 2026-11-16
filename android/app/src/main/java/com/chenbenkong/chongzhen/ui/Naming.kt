package com.chenbenkong.chongzhen.ui

import kotlin.random.Random

// ============================================================================
// 取名 / 字 / 籍贯候选表与生成规则。
// 引擎与 game-data.json 均未暴露命名生成能力；本表与规则逐字对照 Web 侧
// src/utils/naming.ts 与 src/mobile/MobileNameSetup.tsx 复刻，UI 层不自造新规则。
// ============================================================================

/** 建议姓氏（快捷点选展示数据）。 */
val SUGGESTED_SURNAMES: List<String> = listOf(
    "李", "张", "王", "刘", "陈", "杨", "赵", "黄", "周", "吴",
    "司马", "欧阳", "诸葛", "上官", "皇甫", "令狐", "慕容", "宇文"
)

/** 建议名讳（快捷点选展示数据）。 */
val SUGGESTED_NAMES: List<String> = listOf(
    "承业", "景行", "明远", "子渊", "伯言", "文举", "君实", "希文",
    "若虚", "怀瑾", "思齐", "致远", "守仁", "惟清", "元白", "乐天",
    "德辉", "志远", "弘文", "敬之", "廷益", "用汲", "子先", "汝贤"
)

private val courtesyPrefixes = listOf("伯", "仲", "叔", "季", "子", "公", "君", "元")
private val courtesySuffixes = listOf("甫", "父", "之", "卿")

/** 名 → 相关字（语义近义 / 同族 / 延伸），与 Web nameSemanticMap 同表。 */
private val nameSemanticMap: Map<String, List<String>> = mapOf(
    "志" to listOf("弘", "毅", "存", "远", "宏"),
    "远" to listOf("通", "达", "遐", "博", "深", "弘"),
    "弘" to listOf("毅", "大", "显", "昭"),
    "毅" to listOf("弘", "刚", "毅", "弘"),
    "达" to listOf("通", "远", "显", "通"),
    "通" to listOf("达", "远", "博", "显"),
    "致" to listOf("达", "通", "显", "昭", "彰"),
    "广" to listOf("博", "弘", "大", "显"),
    "进" to listOf("取", "修", "立", "业"),
    "取" to listOf("得", "与", "成", "立"),
    "立" to listOf("业", "成", "达", "显"),
    "建" to listOf("业", "立", "成", "功"),
    "德" to listOf("辉", "馨", "崇", "修", "仁"),
    "仁" to listOf("义", "礼", "智", "信", "和"),
    "义" to listOf("仁", "信", "忠", "孝", "节"),
    "礼" to listOf("仁", "义", "和", "敬"),
    "智" to listOf("仁", "信", "达", "明"),
    "信" to listOf("仁", "义", "诚", "实"),
    "忠" to listOf("孝", "节", "义", "信"),
    "孝" to listOf("弟", "悌", "忠", "仁"),
    "廉" to listOf("洁", "节", "清", "明"),
    "节" to listOf("义", "信", "坚", "刚"),
    "文" to listOf("章", "彬", "质", "秀", "华"),
    "武" to listOf("勇", "毅", "刚", "强"),
    "章" to listOf("文", "华", "采", "彰"),
    "彬" to listOf("文", "质", "秀"),
    "秀" to listOf("文", "华", "英", "彦"),
    "彦" to listOf("文", "秀", "英", "才"),
    "才" to listOf("秀", "彦", "英", "文"),
    "学" to listOf("文", "思", "辩", "博"),
    "思" to listOf("远", "齐", "正", "诚"),
    "明" to listOf("德", "显", "昭", "光", "达"),
    "光" to listOf("明", "显", "耀", "辉"),
    "辉" to listOf("明", "光", "耀", "德"),
    "昭" to listOf("明", "显", "彰", "德"),
    "显" to listOf("明", "昭", "彰", "达"),
    "若" to listOf("虚", "谷", "兰", "芷"),
    "清" to listOf("和", "净", "远", "静"),
    "静" to listOf("清", "和", "远", "安"),
    "和" to listOf("清", "静", "仁", "义"),
    "守" to listOf("仁", "正", "诚", "义"),
    "正" to listOf("诚", "明", "直", "刚"),
    "希" to listOf("文", "元", "圣", "贤"),
    "虚" to listOf("怀", "谷", "清", "远"),
    "怀" to listOf("虚", "瑾", "瑜", "德"),
    "瑾" to listOf("瑜", "怀", "瑶", "华"),
    "承" to listOf("先", "绪", "宏", "毅", "业"),
    "业" to listOf("宏", "成", "立", "显"),
    "先" to listOf("承", "绪", "进", "达"),
    "绪" to listOf("先", "业", "承", "宏"),
    "景" to listOf("行", "昭", "德", "光"),
    "行" to listOf("止", "由", "修", "远", "进"),
    "修" to listOf("德", "仁", "业", "文"),
    "允" to listOf("诚", "信", "和", "执"),
    "执" to listOf("诚", "信", "义", "守"),
    "寅" to listOf("虎"),
    "辰" to listOf("龙"),
    "午" to listOf("骐", "骏"),
    "子" to listOf("龙", "骐")
)

/** 通用好字（任何名字兜底可用）。 */
private val generalGoodChars = listOf(
    "德", "仁", "义", "礼", "智", "信", "忠", "孝",
    "达", "通", "远", "宏", "弘", "毅", "显", "昭", "彰", "光", "耀", "辉",
    "明", "章", "彬", "秀", "质", "文", "行", "先", "绪", "安", "平", "正", "清", "和", "冲", "希", "怀", "守", "进",
    "甫", "父", "之", "卿", "公", "元", "君", "伯", "仲", "叔", "季",
    "诚", "实", "刚", "坚", "节", "廉", "瑾", "瑜", "瑶", "华", "采",
    "骐", "骏", "虎", "龙", "麟", "凤", "鹏", "骞"
)

/** 明朝常见籍贯池（与 Web hometownPool 同表）。 */
val HOMETOWN_POOL: List<String> = listOf(
    "北直隶顺天府大兴县", "北直隶顺天府宛平县", "北直隶保定府清苑县", "北直隶保定府安州",
    "北直隶河间府献县", "北直隶真定府正定县", "北直隶永平府卢龙县", "北直隶宣化府宣化县",
    "南直隶应天府上元县", "南直隶应天府江宁县", "南直隶苏州府吴县", "南直隶苏州府长洲县",
    "南直隶松江府华亭县", "南直隶常州府武进县", "南直隶扬州府江都县", "南直隶淮安府山阳县",
    "南直隶凤阳府凤阳县", "南直隶庐州府合肥县", "南直隶徽州府歙县", "南直隶宁国府宣城县",
    "浙江杭州府仁和县", "浙江杭州府钱塘县", "浙江绍兴府会稽县", "浙江绍兴府山阴县",
    "浙江宁波府鄞县", "浙江湖州府乌程县", "浙江嘉兴府秀水县", "浙江金华府义乌县",
    "浙江台州府临海县", "浙江温州府永嘉县",
    "江西南昌府南昌县", "江西吉安府庐陵县", "江西抚州府临川县", "江西赣州府赣县",
    "江西九江府德化县", "江西饶州府鄱阳县",
    "福建福州府闽县", "福建福州府侯官县", "福建泉州府晋江县", "福建漳州府龙溪县",
    "福建建宁府建安县", "福建兴化府莆田县",
    "湖广武昌府江夏县", "湖广汉阳府汉阳县", "湖广黄州府黄冈县", "湖广长沙府长沙县",
    "湖广岳州府巴陵县", "湖广衡州府衡阳县", "湖广常德府武陵县", "湖广宝庆府邵阳县",
    "山东济南府历城县", "山东兖州府曲阜县", "山东青州府益都县", "山东登州府蓬莱县",
    "山东莱州府掖县", "山东东昌府聊城县", "山东曹州府曹县",
    "河南开封府祥符县", "河南归德府商丘县", "河南汝宁府汝阳县", "河南南阳府南阳县",
    "河南汝州鲁山县", "河南卫辉府汲县", "河南河南府洛阳县",
    "山西太原府阳曲县", "山西平阳府临汾县", "山西汾州府汾阳县", "山西潞安府长治县",
    "山西大同府大同县", "山西泽州府凤台县",
    "陕西西安府长安县", "陕西西安府咸宁县", "陕西凤翔府凤翔县", "陕西延安府肤施县",
    "陕西汉中府南郑县", "陕西临洮府狄道县",
    "四川成都府成都县", "四川成都府华阳县", "四川重庆府巴县", "四川叙州府宜宾县",
    "四川保宁府阆中县",
    "广东广州府南海县", "广东广州府番禺县", "广东潮州府海阳县", "广东惠州府归善县",
    "广东韶州府曲江县", "广东琼州府琼山县",
    "广西桂林府临桂县", "广西柳州府马平县", "广西梧州府苍梧县",
    "云南云南府昆明县", "云南大理府太和县", "云南临安府建水县",
    "贵州贵阳府贵阳县", "贵州思州府思州",
    "辽东都司沈阳中卫", "辽东都司辽阳中卫", "辽东都司广宁中卫"
)

/**
 * 按「名」生成两字「字」，与名不撞字（口径同 Web generateCourtesyName）。
 */
fun generateCourtesyName(givenName: String, random: Random = Random.Default): String {
    val name = givenName.trim()
    if (name.isEmpty()) return ""

    val forbidden: Set<String> = name.map { it.toString() }.toSet()
    val relatedRaw = mutableListOf<String>()
    for (ch in name) {
        nameSemanticMap[ch.toString()]?.let { relatedRaw.addAll(it) }
    }
    val relatedChars: List<String> = relatedRaw.distinct().filterNot { it in forbidden }
    val fallbackChars: List<String> = generalGoodChars.filterNot { it in forbidden }
    if (fallbackChars.isEmpty()) return ""

    fun pickMid(exclude: String?): String {
        val pool = (if (relatedChars.isNotEmpty()) relatedChars else fallbackChars)
            .filterNot { it == exclude }
        if (pool.isEmpty()) return fallbackChars.firstOrNull { it != exclude } ?: ""
        return pool[random.nextInt(pool.size)]
    }

    val mode = random.nextDouble()
    if (mode < 0.45) {
        val safePrefixes = courtesyPrefixes.filterNot { it in forbidden }
        if (safePrefixes.isEmpty()) return pickMid(null) + pickMid(null)
        val prefix = safePrefixes[random.nextInt(safePrefixes.size)]
        return prefix + pickMid(prefix)
    } else if (mode < 0.85) {
        val safeSuffixes = courtesySuffixes.filterNot { it in forbidden }
        if (safeSuffixes.isEmpty()) return pickMid(null) + pickMid(null)
        val suffix = safeSuffixes[random.nextInt(safeSuffixes.size)]
        return pickMid(suffix) + suffix
    } else {
        val c1 = pickMid(null)
        var c2 = pickMid(c1)
        if (c2 == c1) c2 = pickMid("§")
        return c1 + c2
    }
}

/** 随机抽一个明代籍贯。 */
fun randomHometown(random: Random = Random.Default): String =
    HOMETOWN_POOL[random.nextInt(HOMETOWN_POOL.size)]

/** 按科举身份推荐默认起始年龄（口径同 Web defaultAgeByDegree）。 */
fun defaultAgeByDegree(degree: String): Int = when (degree) {
    "进士" -> 22
    "举人" -> 24
    "贡士" -> 20
    "秀才" -> 18
    "童生" -> 16
    else -> 22
}
