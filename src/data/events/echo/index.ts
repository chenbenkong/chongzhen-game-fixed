import { GameEvent } from '../../../types/event'
import { imperialEchoEvents } from './imperial'
import { familyEchoEvents } from './family'
import { factionEchoEvents } from './faction'
import { emotionEchoEvents } from './emotion'
import { aftermathEchoEvents } from './aftermath'

/**
 * 回响池（echo）。
 *
 * 这一池**不是新剧情**，是给已有剧情补下文。判断标准只有一条：
 * 一个 flag 如果在实测 100 局里被带上身 10 次以上，而全内容池没有任何一处读它，
 * 那玩家那次抉择就等于没有发生过。第十四轮实测：361 个被写入的 flag 里 215 个只写不读，
 * 平均每局随身带 9.8 个死 flag。
 *
 * 接线表（谁读谁）——「读」列是这一池的开门条件，「写」列是它自己的产出，
 * 产出必须被别处读，否则这一池自己就变成了新的白存堆：
 *
 *   读 `崇祯赏识`      → echo_imperial_001 平台召对   写 独对之荣 / 召对无言 / 平台三策
 *   读 `直臣`          → echo_imperial_002 言官除书   写 言路官 / 台谏之声 / 缄口御史 / 外任实缺
 *   读 `哭庙`          → echo_imperial_003 旧君之思   写 先帝旧臣 / 直笔 / 讳言旧朝 / 不论旧朝
 *   读 `新政建议`      → echo_imperial_004 新政回禄   写 新政未成 / 一事之效 / 旧议已收
 *   读 `弃母求仕`      → echo_family_001  讣音至京   写 丁忧在籍 / 夺情起复 / 不孝之名 / 遣祭代归
 *   读 `变产救母`      → echo_family_002 孝廉之荐   写 孝廉之名 / 乡党依倚 / 让善于乡 / 乡里护产
 *   读 `负债借贷`      → echo_family_003 人情到期   写 债清人疏 / 择债而偿 / 债变利 / 贪声已著
 *   读 `阉党关系|中官系|阉党余孽` → echo_faction_001 门生帖子  写 阉党核心 / 内廷奥援 / 半门之客 / 弹劾阉党 / 与内廷绝
 *   读 `阉党余孽`      → echo_faction_002 《寒门论》 写 负讥不辩 / 改文之讥 / 引火烧人 / 士林公敌
 *   读 `婉拒清流`      → echo_faction_003 两不相涉   写 不系一党 / 晚归清流 / 求外避察
 *   读 `名师指点|清流举荐` → echo_faction_004 座师之门 写 门生故吏 / 座师之门 / 私祭不党 / 门生祭酒
 *   读 `参与清洗阉党|阉党关系` → echo_faction_005 清洗的账 写 逆案自承 / 逆案脱身 / 两头取利
 *   读 `abandoned_liushi|regret_forever` → echo_emotion_001 如烟嫁期 写 如烟已嫁 / 旧盟重寻 / 再负一回
 *   读 `xianv_token`   → echo_emotion_002 玉佩之约   写 侠女之盟 / 借刀之人 / 侠女自去 / 藏人于外
 *   读 `protect_xialing|xialing_exposed|藏人于外` → echo_emotion_003 东厂的那本册子 写 守口至终 / 卖人求安 / 一刻钟之恩 / 萧灵血案
 *   读 `hongxiu_*`     → echo_emotion_004 秦淮旧账   写 秦淮债清 / 红袖的下落 / 赖名于秦淮
 *   读 `lixiangjun_respect` → echo_emotion_005 桃叶渡再闻 写 桃花扇底 / 还扇之义
 *   读 `wife_lishi|lishi_benefactor` → echo_emotion_006 李家那条船 写 三日之信 / 改漕之案 / 恩义付之
 *
 * 上面那十二环的**产出**里仍有一批没人读。第十六轮实测（warden / steady 各 100 局）：
 * 携带榜前十五条有七条是这一池自己写的——`不系一党` 一局带上 49/100 次，无人读它。
 * 于是有了**第二波** `aftermath.ts`，专读上面这一栏的产出，并且刻意不产新词
 * （每个选项除了自己的 `echo_*_done` 之外，只写早已存在的 flag）：
 *
 *   读 不系一党 / 半门之客 / 求外避察 / 晚归清流 / 负讥不辩 / 改文之讥 → echo_faction_006 不系之名
 *   读 乡里护产 / 让善于乡 / 乡党依倚 / 孝廉之名 / 债清人疏           → echo_family_004 学田的碑
 *   读 wife_broken / tyrant_husband / wife_hurt / concubine_killed /
 *       wife_jealous / pingqi_attempt                                → echo_family_005 门内门外
 *   读 恩义付之 / 改漕之案 / 三日之信                                → echo_emotion_007 李家的旧账
 *   读 lixiangjun_disappointed / lixiangjun_poem / 桃花扇底 / 还扇之义 /
 *       ruan_dacheng_enemy                                           → echo_emotion_008 扇价
 *
 * 其中 `藏人于外`、`萧灵血案`、`不孝之名`、`夺情起复`、`阉党核心` 这几条是**池内自接**：
 * 上一环写，下一环读，这样新产出的 flag 不会立刻变成新的白存。
 * 另有几条被派去读旧事件（见 faction_events.ts 的 notHas 门与 echo_imperial_004 的门）。
 */
export const allEchoEvents: GameEvent[] = [
  ...imperialEchoEvents,
  ...familyEchoEvents,
  ...factionEchoEvents,
  ...emotionEchoEvents,
  // 第二波：读上面那十二环的产出（见 aftermath.ts 顶部的接线表）
  ...aftermathEchoEvents
]

export {
  imperialEchoEvents,
  familyEchoEvents,
  factionEchoEvents,
  emotionEchoEvents,
  aftermathEchoEvents
}
