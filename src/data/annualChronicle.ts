/**
 * 年度史载：每年正月翻页时压在牌桌上的一页「朝局」。
 *
 * 只写一条史馆口径的大势，不重复事件正文，也不替玩家结算。
 * 条目按游戏内年份 1628–1644 排列，标题尽量落在当年历史事件分片
 * （src/data/events/historical/<year>.ts）的首拍上，避免「史载」与牌桌事件互相打架。
 */
export interface AnnualChronicleEntry {
  /** 当年大势的一句话标题，用于卡片抬头 */
  headline: string
  /** 一句补充，交代标题之外最要紧的一笔 */
  detail: string
}

export const ANNUAL_CHRONICLE: Record<number, AnnualChronicleEntry> = {
  1628: {
    headline: '魏忠贤伏诛，崇祯新政初启',
    detail: '阉党覆灭，东林起复；新君锐意治边、理财，朝局一时有振作之象。'
  },
  1629: {
    headline: '后金破塞，己巳之变',
    detail: '皇太极绕关入塞，京师戒严；袁崇焕勤王，朝议自此多疑。'
  },
  1630: {
    headline: '袁崇焕磔于西市，陕北大旱',
    detail: '辽东主帅既去，关宁军心浮动；陕西饥民遍地，赤地千里。'
  },
  1631: {
    headline: '登莱欠饷，东江兵变',
    detail: '孔有德据登州而反，沿海饷道断绝；朝廷剿抚两难。'
  },
  1632: {
    headline: '皮岛清算，东江离心',
    detail: '东江镇内乱迭起，海上牵制之力渐失；朝中党争复炽。'
  },
  1633: {
    headline: '徐光启卒，西学之脉未绝',
    detail: '农政、历法、火器之议暂失主持；徐霞客远游，实学仍在民间。'
  },
  1634: {
    headline: '三晋大旱，流寇复炽',
    detail: '赈济与剿杀之争再起；饥民入贼，流寇声势复壮。'
  },
  1635: {
    headline: '闯王被擒，张献忠入蜀',
    detail: '高迎祥既败，李自成暂匿；流寇分入川、楚，官军疲于奔命。'
  },
  1636: {
    headline: '皇太极称帝，改国号大清',
    detail: '辽东由边患变为敌国；朝中议和、北伐之议再起。'
  },
  1637: {
    headline: '陈圆圆入京，黄宗羲父案',
    detail: '外戚、宦官与士林交相倾轧；清议愈激，朝局愈腐。'
  },
  1638: {
    headline: '督师出征，松锦失利',
    detail: '关外增援一再失机，精锐耗于坚城之下；辽饷愈急。'
  },
  1639: {
    headline: '松锦大战，洪承畴降清',
    detail: '明军关外精锐尽失，宁远、山海关一线成为最后屏障。'
  },
  1640: {
    headline: '松锦增援，闯王入河南',
    detail: '关外再调重兵，中原空虚；李自成入河南，饥民从者日众。'
  },
  1641: {
    headline: '李自成称王，开封被围',
    detail: '流寇始立名号，中原糜烂；官军救汴，屡遭覆没。'
  },
  1642: {
    headline: '宁远孤守，开封之战',
    detail: '关外孤城难支，中原重镇告急；朝廷两面受敌，饷源枯竭。'
  },
  1643: {
    headline: '孙传庭出师，秦军末路',
    detail: '关中最后一支可战之兵出潼关；败讯既至，京师门户洞开。'
  },
  1644: {
    headline: '大顺建国，甲申之变',
    detail: '李自成称帝于西安，宣大相继陷落；大明已到最后一页。'
  }
}

export function getAnnualChronicle(year: number): AnnualChronicleEntry | null {
  return ANNUAL_CHRONICLE[year] ?? null
}
