import { useState, useEffect, useCallback, useId } from 'react'
import './NameInput.css'
import { generateCourtesyName, randomHometown } from '../utils/naming'

export interface NameInputResult {
  name: string
  courtesyName: string
  age: number
  hometown: string
}

interface NameInputProps {
  onConfirm: (result: NameInputResult) => void
}

// 单姓 + 复姓混排（复姓需 2 字，已被姓 input 的 maxLength={2} 兼容）
const suggestedSurnames = [
  // 常见单姓
  '李', '张', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗',
  // 经典复姓（仿明史列传常见 + 明代实有）
  '司马', '欧阳', '诸葛', '上官', '皇甫', '令狐', '尉迟', '长孙', '慕容', '宇文', '司徒', '司空', '公羊', '公冶', '端木'
]
// 全部 2 字名（仿明清士人常用字：志/德/仁/义/礼/智/信 + 远/承/希/文/明/伯/君/元 + 之/甫/卿/父）
const suggestedNames = [
  '承业', '景行', '明远', '子渊', '伯言', '文举', '君实', '希文',
  '若虚', '怀瑾', '思齐', '致远', '守仁', '惟清', '元白', '乐天',
  '德辉', '志远', '弘文', '敬之', '廷益', '用汲', '懋贞', '子先',
  '汝贤', '刚峰', '稚钦', '于乔', '仲纶', '子龙', '逸少', '士贞',
  '孟坚', '子昂', '长卿', '太白', '少陵', '摩诘', '昌黎', '义山',
  '永叔', '子瞻', '子由', '介甫', '东坡', '放翁', '务观', '易安',
  '希夷', '冲远', '景仁', '尧夫', '正叔', '明道', '伊川', '横渠',
  '元晦', '晦庵', '南轩', '东莱', '西山', '勉斋', '北湖', '水心',
  // 单字名（仿古人单名习俗：姓 + 单字 + 字双字）
  '承', '远', '仁', '毅', '弘', '达', '通', '明', '德', '智', '信', '和', '清', '正', '守', '怀'
]

export default function NameInput({ onConfirm }: NameInputProps) {
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [courtesyName, setCourtesyName] = useState('')  // 字
  const [age, setAge] = useState<string>('22')           // 字符串方便 input 控制
  const [hometown, setHometown] = useState('')           // 籍贯
  // 标记"字是否由系统自动填"，避免用户清空后又被覆盖
  const [autoGenCourtesy, setAutoGenCourtesy] = useState(true)

  // 表单字段 id 前缀：useId 保证同名表单多次挂载也不会冲突
  const formId = useId()
  const surnameId = `${formId}-surname`
  const givenNameId = `${formId}-given-name`
  const courtesyId = `${formId}-courtesy`
  const ageId = `${formId}-age`
  const hometownId = `${formId}-hometown`

  const fullName = surname + name

  // 当姓名变化时，自动生成"字"（如果用户没有手动改过）
  useEffect(() => {
    if (autoGenCourtesy && (surname || name)) {
      // 用名（不含姓）做种子，避免姓也参与选字
      const generated = generateCourtesyName(name)
      if (generated) setCourtesyName(generated)
    }
  }, [surname, name, autoGenCourtesy])

  const handleRandom = () => {
    const randomSurname = suggestedSurnames[Math.floor(Math.random() * suggestedSurnames.length)]
    const randomName = suggestedNames[Math.floor(Math.random() * suggestedNames.length)]
    setSurname(randomSurname)
    setName(randomName)
    setAutoGenCourtesy(true)  // 随机点名字后，让"字"也跟着重新生成
    // 一键随机就该交出一份完整身份：籍贯没填时顺手抽一个，已填的不覆盖
    setHometown((prev) => (prev.trim() ? prev : randomHometown()))
  }

  const handleRandomHometown = () => {
    setHometown(randomHometown())
  }

  const handleSurnameClick = (s: string) => {
    setSurname(s)
  }

  const handleGivenNameClick = (n: string) => {
    setName(n)
  }

  const handleCourtesyChange = (val: string) => {
    setCourtesyName(val)
    setAutoGenCourtesy(false)  // 标记"用户自己改过"，停止自动覆盖
  }

  const handleAgeChange = (val: string) => {
    // 只允许数字，限定 16-60
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

  const canConfirm = fullName.trim() && courtesyName.trim() && hometown.trim() && ageValid

  // 主按钮按不动时把缺的格子写出来 —— 玩家点【随机取名】却停在原地，就是因为没有这句话
  const missingFields = [
    !surname.trim() ? '姓' : '',
    !name.trim() ? '名' : '',
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canConfirm) {
      handleConfirm()
    }
  }

  return (
    <div className="name-input-screen">
      <div className="name-scroll">
        <h1>请 赐 名 字</h1>
        <p className="name-quote">"名以正体，字以表德。"</p>

        <div className="name-form">
          {/* 第一行：姓 · 名 · 字 · 年岁 —— 横向 4 列排版，一屏装下 */}
          <div className="name-row primary-row">
            <div className="name-cell">
              <label htmlFor={surnameId}>姓</label>
              <input
                id={surnameId}
                type="text"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入姓氏"
                maxLength={2}
                className="name-input surname-input"
              />
            </div>
            <div className="name-cell">
              <label htmlFor={givenNameId}>名</label>
              <input
                id={givenNameId}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入名字"
                maxLength={2}
                className="name-input given-name-input"
              />
            </div>
            <div className="name-cell">
              <label htmlFor={courtesyId}>字 <span className="auto-hint">（按名生成，可改）</span></label>
              <input
                id={courtesyId}
                type="text"
                value={courtesyName}
                onChange={(e) => handleCourtesyChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="如：伯承"
                maxLength={2}
                className="name-input courtesy-input"
              />
            </div>
            <div className="name-cell age-cell">
              <label htmlFor={ageId}>年岁 <span className="auto-hint">（16-60）</span></label>
              <input
                id={ageId}
                type="text"
                inputMode="numeric"
                value={age}
                onChange={(e) => handleAgeChange(e.target.value)}
                onBlur={handleAgeBlur}
                onKeyDown={handleKeyDown}
                placeholder="22"
                className="name-input age-input"
              />
            </div>
          </div>

          {/* 第二行：籍贯（带随机抽） */}
          <div className="name-row hometown-row">
            <div className="name-cell flex-grow">
              <label htmlFor={hometownId}>籍贯 <span className="auto-hint">（如：南直隶苏州府吴县）</span></label>
              <div className="hometown-input-wrap">
                <input
                  id={hometownId}
                  type="text"
                  value={hometown}
                  onChange={(e) => setHometown(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="X省X府X县"
                  maxLength={14}
                  className="name-input hometown-input"
                />
                <button
                  type="button"
                  className="random-hometown-btn"
                  onClick={handleRandomHometown}
                  title="随机抽一个明代常见籍贯"
                >
                  随机抽
                </button>
              </div>
            </div>
            <div className="name-cell action-cell">
              <button
                className={`confirm-btn inline ${!canConfirm ? 'disabled' : ''}`}
                onClick={handleConfirm}
                disabled={!canConfirm}
              >
                定 此 名 字
              </button>
              <button className="random-btn inline" onClick={handleRandom}>
                随 机 取 名
              </button>
            </div>
          </div>

          {missingFields.length > 0 && (
            <div className="name-hint" role="status">
              还缺：{missingFields.join('、')}
            </div>
          )}

          {/* 预览：横向一行 */}
          <div className="preview-name preview-horizontal">
            {fullName ? (
              <>
                <span className="preview-label">阁下：</span>
                <span className="preview-value">{fullName}</span>
                {courtesyName && <span className="preview-value-small">，字{courtesyName}</span>}
                {ageValid && <span className="preview-value-small">，年{age}</span>}
                {hometown && <span className="preview-value-small">，{hometown}人</span>}
              </>
            ) : (
              <span className="preview-placeholder">请输入姓名</span>
            )}
          </div>
        </div>

        <div className="suggested-names suggested-compact">
          <div className="suggest-section">
            <h2>常见姓氏</h2>
            <div className="suggest-list">
              {suggestedSurnames.map((s) => (
                <button
                  key={s}
                  className={`suggest-chip ${surname === s ? 'active' : ''}`}
                  onClick={() => handleSurnameClick(s)}
                >{s}</button>
              ))}
            </div>
          </div>

          <div className="suggest-section">
            <h2>雅致名讳（点选填入）</h2>
            <div className="suggest-list">
              {suggestedNames.map((n) => (
                <button
                  key={n}
                  className={`suggest-chip ${name === n ? 'active' : ''}`}
                  onClick={() => handleGivenNameClick(n)}
                >{n}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
