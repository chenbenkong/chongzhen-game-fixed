import chongzhenPortrait from '../assets/portrait-chongzhen.webp'
import sunchuantingPortrait from '../assets/portrait-sunchuanting.webp'
import yuanchonghuanPortrait from '../assets/portrait-yuanchonghuan.webp'
import hongchengchouPortrait from '../assets/portrait-hongchengchou.webp'
import yangSichangPortrait from '../assets/portrait-yang-sichang.webp'
import wenTirenPortrait from '../assets/portrait-wen-tiren.webp'
import wusanguiPortrait from '../assets/portrait-wusangui.webp'
import liZichengPortrait from '../assets/portrait-li-zicheng.webp'
import huangTaijiPortrait from '../assets/portrait-huang-taiji.webp'
import weiZhongxianPortrait from '../assets/portrait-wei-zhongxian.webp'
import luXiangshengPortrait from '../assets/portrait-lu-xiangsheng.webp'
import furenPortrait from '../assets/portrait-furen.webp'
import { RECURRING_CHARACTERS, type RecurringCharacter } from './characters'

/**
 * P2.4：12 个常驻人物的纸本木刻胸像。
 *
 * 图片按人物 id 与数据表一一对应；结局“故人”和专属人物事件都从这里取图，
 * 避免 UI 自己拼资源路径。以后换图只改这一层映射。
 */
export const CHARACTER_PORTRAITS: Record<string, string> = {
  chongzhen: chongzhenPortrait,
  sunchuanting: sunchuantingPortrait,
  yuanchonghuan: yuanchonghuanPortrait,
  hongchengchou: hongchengchouPortrait,
  yang_sichang: yangSichangPortrait,
  wen_tiren: wenTirenPortrait,
  wu_sangui: wusanguiPortrait,
  li_zicheng: liZichengPortrait,
  huang_taiji: huangTaijiPortrait,
  wei_zhongxian: weiZhongxianPortrait,
  lu_xiangsheng: luXiangshengPortrait,
  furen: furenPortrait
}

export function characterPortrait(characterId: string): string | undefined {
  return CHARACTER_PORTRAITS[characterId]
}

/**
 * 四个专属人物事件：事件里出现的是“被召见/被议论的那个人”，
 * 说话者往往是幕僚或太监。事件条上单独出一条人物签，避免把
 * 说话者的通名头像误当成主角本人。
 */
const FIGURE_EVENT_CHARACTERS: Record<string, string> = {
  figure_chongzhen_audience: 'chongzhen',
  figure_hong_chengchou: 'hongchengchou',
  figure_sun_chuanting: 'sunchuanting',
  figure_wu_sangui: 'wu_sangui'
}

export interface FigureEventPortrait {
  character: RecurringCharacter
  portrait: string
}

export function figureEventPortrait(eventId: string): FigureEventPortrait | undefined {
  const characterId = FIGURE_EVENT_CHARACTERS[eventId]
  if (!characterId) return undefined
  const character = RECURRING_CHARACTERS.find((entry) => entry.id === characterId)
  const portrait = CHARACTER_PORTRAITS[characterId]
  if (!character || !portrait) return undefined
  return { character, portrait }
}
