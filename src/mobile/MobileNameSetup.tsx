/**
 * 手机版起名屏 —— 姓名 / 字 / 籍贯 / 起始年龄。
 *
 * 字段与校验口径参照桌面 components/NameInput.tsx；自动生成「字」与随机籍贯
 * 一律复用 utils/naming.ts，不在这里另写一套命名规则。
 */
import { useEffect, useState, useCallback } from 'react'
import type { NameInputResult } from '../components/NameInput'
import { generateCourtesyName, randomHometown } from '../utils/naming'

// 建议姓氏 / 名讳（仅作快捷点选的展示数据，取名规则仍走 naming.ts）。
const SUGGESTED_SURNAMES = [
  '李', '张', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴',
  '司马', '欧阳', '诸葛', '上官', '皇甫', '令狐', '慕容', '宇文'
]
const SUGGESTED_NAMES = [
  '承业', '景行', '明远', '子渊', '伯言', '文举', '君实', '希文',
  '若虚', '怀瑾', '思齐', '致远', '守仁', '惟清', '元白', '乐天',
  '德辉', '志远', '弘文', '敬之', '廷益', '用汲', '子先', '汝贤'
]

interface MobileNameSetupProps {
  onConfirm: (result: NameInputResult) => void
  onBack: () => void
}

export default function MobileNameSetup({ onConfirm, onBack }: MobileNameSetupProps) {
  const [surname, setSurname] = useState('')
  const [givenName, setGivenName] = useState('')
  const [courtesyName, setCourtesyName] = useState('')
  const [age, setAge] = useState('22')
  const [hometown, setHometown] = useState('')
  // 「字」是否仍由系统按名自动生成；玩家手改后停止自动覆盖（与桌面同名逻辑）。
  const [autoGenCourtesy, setAutoGenCourtesy] = useState(true)

  const fullName = surname + givenName

  // 名变化时按 naming.ts 的规则自动生成字（玩家没手动改过才覆盖）。
  useEffect(() => {
    if (autoGenCourtesy && givenName) {
      const generated = generateCourtesyName(givenName)
      if (generated) setCourtesyName(generated)
    }
  }, [surname, givenName, autoGenCourtesy])

  const handleRandom = useCallback(() => {
    const s = SUGGESTED_SURNAMES[Math.floor(Math.random() * SUGGESTED_SURNAMES.length)]
    const n = SUGGESTED_NAMES[Math.floor(Math.random() * SUGGESTED_NAMES.length)]
    setSurname(s)
    setGivenName(n)
    setAutoGenCourtesy(true)
    setHometown(prev => (prev.trim() ? prev : randomHometown()))
  }, [])

  const handleAgeChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '').slice(0, 2)
    setAge(cleaned)
  }

  const handleAgeBlur = () => {
    const n = parseInt(age || '0', 10)
    if (n < 16) setAge('16')
    else if (n > 60) setAge('60')
  }

  const ageNum = parseInt(age || '0', 10)
  const ageValid = ageNum >= 16 && ageNum <= 60
  const canConfirm = Boolean(fullName.trim() && courtesyName.trim() && hometown.trim() && ageValid)

  const missingFields = [
    !surname.trim() ? '姓' : '',
    !givenName.trim() ? '名' : '',
    !courtesyName.trim() ? '字' : '',
    !hometown.trim() ? '籍贯' : '',
    !ageValid ? '年岁' : ''
  ].filter(Boolean)

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return
    onConfirm({
      name: fullName.trim(),
      courtesyName: courtesyName.trim(),
      age: ageNum,
      hometown: hometown.trim()
    })
  }, [canConfirm, fullName, courtesyName, ageNum, hometown, onConfirm])

  return (
    <div className="mobile-name">
      <div className="mobile-name__head">
        <h1 className="mobile-name__title">请 赐 名 字</h1>
        <button type="button" className="mobile-btn mobile-btn--ghost mobile-name__back" onClick={onBack}>
          ← 返回
        </button>
      </div>
      <p className="mobile-name__quote">「名以正体，字以表德。」</p>

      <div className="mobile-name__form">
        <div className="mobile-name__row mobile-name__row--identity">
          <label className="mobile-field">
            <span className="mobile-field__label">姓</span>
            <input
              type="text"
              value={surname}
              maxLength={2}
              placeholder="姓氏"
              onChange={e => setSurname(e.target.value)}
            />
          </label>
          <label className="mobile-field">
            <span className="mobile-field__label">名</span>
            <input
              type="text"
              value={givenName}
              maxLength={2}
              placeholder="名字"
              onChange={e => setGivenName(e.target.value)}
            />
          </label>
          <label className="mobile-field">
            <span className="mobile-field__label">字 <em>可改</em></span>
            <input
              type="text"
              value={courtesyName}
              maxLength={2}
              placeholder="如：伯承"
              onChange={e => {
                setCourtesyName(e.target.value)
                setAutoGenCourtesy(false)
              }}
            />
          </label>
          <label className="mobile-field">
            <span className="mobile-field__label">年岁 <em>16–60</em></span>
            <input
              type="text"
              inputMode="numeric"
              value={age}
              placeholder="22"
              onChange={e => handleAgeChange(e.target.value)}
              onBlur={handleAgeBlur}
            />
          </label>
        </div>

        <label className="mobile-field mobile-field--hometown">
          <span className="mobile-field__label">籍贯</span>
          <div className="mobile-name__hometown-wrap">
            <input
              type="text"
              value={hometown}
              maxLength={14}
              placeholder="如：南直隶苏州府吴县"
              onChange={e => setHometown(e.target.value)}
            />
            <button type="button" className="mobile-btn mobile-btn--ghost" onClick={() => setHometown(randomHometown())}>
              随机抽
            </button>
          </div>
        </label>

        {missingFields.length > 0 && (
          <div className="mobile-name__hint" role="status">还缺：{missingFields.join('、')}</div>
        )}

        <div className="mobile-name__actions">
          <button type="button" className="mobile-btn" onClick={handleRandom}>随 机 取 名</button>
          <button
            type="button"
            className="mobile-btn mobile-btn--primary"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            定 此 名 字
          </button>
        </div>
      </div>
    </div>
  )
}
