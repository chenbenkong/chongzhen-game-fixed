/**
 * 明代年号纪年的轻量格式化工具。
 *
 * 单独成文件，是为了让标题屏的生涯档案条不必为了一个年份换算
 * 去拉 `endingSystem`（后者会带出整包结局事件，标题屏首屏会多请求
 * 一个 200KB+ 的 events-ending 分片）。
 */

/** 阿拉伯数字 → 汉字数字（用于年龄/序号等小整数） */
export function toChineseNum(n: number): string {
  if (n === 0) return '〇'
  if (n < 0) return '负' + toChineseNum(-n)
  const d = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (n < 10) return d[n]
  if (n < 20) return n === 10 ? '十' : '十' + d[n - 10]
  if (n < 100) {
    const t = Math.floor(n / 10), o = n % 10
    return d[t] + '十' + (o ? d[o] : '')
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100
    return d[h] + '百' + (r ? toChineseNum(r) : '')
  }
  return String(n)
}

/** 西历年 → 明代年号纪年。元年用"元"不用"一" */
export function toMingEraYear(year: number): string {
  if (year >= 1628) return '崇祯' + (year === 1628 ? '元' : toChineseNum(year - 1627)) + '年'
  if (year >= 1621) return '天启' + (year === 1621 ? '元' : toChineseNum(year - 1620)) + '年'
  if (year === 1620) return '泰昌元年'
  if (year >= 1573) return '万历' + (year === 1573 ? '元' : toChineseNum(year - 1572)) + '年'
  return toChineseNum(year) + '年'
}
