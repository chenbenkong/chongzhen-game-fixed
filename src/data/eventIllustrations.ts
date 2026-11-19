import xinjunDengji from '../assets/event-xinjun-dengji.webp'
import yandangFumie from '../assets/event-yandang-fumie.webp'
import jisiZhibian from '../assets/event-jisi-zhibian.webp'
import yuanchonghuanZhiSi from '../assets/event-yuanchonghuan-zhi-si.webp'
import chidiQianli from '../assets/event-chidi-qianli.webp'
import denglaiQianxiang from '../assets/event-denglai-qianxiang.webp'
import wuqiaoBingbian from '../assets/event-wuqiao-bingbian.webp'
import sanjinDahan from '../assets/event-sanjin-dahan.webp'
import liukouZhuangda from '../assets/event-liukou-zhuangda.webp'
import qingguoJianli from '../assets/event-qingguo-jianli.webp'
import dushiChuzheng from '../assets/event-dushi-chuzheng.webp'
import songjinDazhan from '../assets/event-songjin-dazhan.webp'
import luXiangshengXunguo from '../assets/event-lu-xiangsheng-xunguo.webp'
import hongchengchouXiangqing from '../assets/event-hongchengchou-xiangqing.webp'
import chuangwangHenan from '../assets/event-chuangwang-henan.webp'
import lizichengChengwang from '../assets/event-lizicheng-chengwang.webp'
import kaifengZhizhan from '../assets/event-kaifeng-zhizhan.webp'
import sunchuantingChushi from '../assets/event-sunchuanting-chushi.webp'
import meishanXunguo from '../assets/event-meishan-xunguo.webp'
import qingjunRuguan from '../assets/event-qingjun-ruguan.webp'

/**
 * P2.5：20 张事件插图。
 *
 * 只给主线关键节点配图，不覆盖全部事件池；按事件 id 静态映射，
 * 保证图片进入 Vite 的资源哈希流程，同时不会在事件未出现时加载。
 */
export const EVENT_ILLUSTRATIONS: Record<string, string> = {
  historical_001: xinjunDengji,
  historical_002: yandangFumie,
  historical_003: jisiZhibian,
  historical_004: yuanchonghuanZhiSi,
  historical_005: chidiQianli,
  historical_006: denglaiQianxiang,
  historical_020_aftermath: wuqiaoBingbian,
  historical_021: sanjinDahan,
  historical_021b: liukouZhuangda,
  historical_009: qingguoJianli,
  historical_022: dushiChuzheng,
  historical_013: songjinDazhan,
  historical_010: luXiangshengXunguo,
  historical_014: hongchengchouXiangqing,
  historical_032: chuangwangHenan,
  historical_008: lizichengChengwang,
  historical_023: kaifengZhizhan,
  historical_1643_sunchuanting: sunchuantingChushi,
  historical_038: meishanXunguo,
  historical_019: qingjunRuguan
}

export function eventIllustration(eventId: string): string | undefined {
  return EVENT_ILLUSTRATIONS[eventId]
}
