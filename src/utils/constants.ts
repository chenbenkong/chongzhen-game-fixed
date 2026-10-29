import { Attributes, GameStateValues } from '../types/game'

// 旧属性名到新属性名的映射
export const ATTR_MAP: Record<string, keyof Attributes> = {
  '文辩': '文韬',
  '朝政': '理政',
  '权势': '理政',
  '机敏': '文韬',
  '道德': '文韬',
  '财帛': '财帛',
  '武略': '武略',
  '体质': '体质',
  '文韬': '文韬',
  '理政': '理政'
}

// 旧状态名到新状态名的映射
export const STATE_MAP: Record<string, keyof GameStateValues> = {
  '帝心': '圣眷',
  '国势': '国势',
  '派系立场': '清议',
  '百姓口碑': '民望',
  '商贾': '士绅',
  '安全': '中官',
  '军事': '国势',
  '道德': '清议',
  '文化': '清议',
  '军心': '国势',
  '圣眷': '圣眷',
  '中官': '中官',
  '清议': '清议',
  '士绅': '士绅',
  '民望': '民望'
}

export const ATTR_BOUNDS: Record<string, { min: number; max: number }> = {
  财帛: { min: 0, max: 100 },
  文韬: { min: 0, max: 100 },
  理政: { min: 0, max: 100 },
  武略: { min: 0, max: 100 },
  体质: { min: 0, max: 100 }
}

export const ATTR_DISPLAY_MAP: Record<string, string> = {
  '文辩': '文韬',
  '朝政': '理政',
  '名望': '名望(已移除)',
  '财帛': '财帛',
  '武略': '武略',
  '体质': '体质',
  '文韬': '文韬',
  '理政': '理政'
}

export const STATE_DISPLAY_MAP: Record<string, string> = {
  '帝心': '圣眷',
  '国势': '国势',
  '派系立场': '清议',
  '百姓口碑': '民望',
  '商贾': '士绅',
  '安全': '中官',
  '圣眷': '圣眷',
  '中官': '中官',
  '清议': '清议',
  '士绅': '士绅',
  '民望': '民望'
}
