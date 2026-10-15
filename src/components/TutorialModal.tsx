import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../hooks/useModal'
import './TutorialModal.css'

interface TutorialModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

const tutorialSteps = [
  {
    title: '欢迎来到明末官场！',
    content: '你是一位刚刚踏入仕途的年轻人，在这个风雨飘摇的时代，你的每一个选择都将影响你的命运。',
    icon: 'welcome'
  },
  {
    title: '属性系统',
    content: '你的能力由五个属性决定：\n\n财帛 - 财富积累能力\n文韬 - 文化与智慧\n理政 - 政务处理能力\n武略 - 军事与谋略\n体质 - 健康状况',
    icon: 'attributes'
  },
  {
    title: '五方态度',
    content: '除了个人属性，你还需要维护五方关系：\n\n圣眷 - 皇帝的信任\n清议 - 士林舆论\n中官 - 宦官关系\n士绅 - 地方势力\n民望 - 百姓口碑',
    icon: 'relations'
  },
  {
    title: '政绩与升官',
    content: '通过做出正确的选择积累政绩分，政绩分达到一定程度时就会升官！\n\n更高的官职意味着更大的权力，但也伴随着更大的风险。',
    icon: 'target'
  },
  {
    title: '剧情线路',
    content: '你的重大选择会把你推向不同的剧情线路：东林风云、边关狼烟、贪墨风云、林泉隐逸……\n\n选择旁若标注 "→ 线路名"，即表示该选项会让你进入或切换至该线路。界面上方也会显示你当前的剧情线。',
    icon: 'storyline'
  },
  {
    title: '多结局',
    content: '同一局游戏，因出身、线路和隐藏属性（道德、欲望、野心）不同，可能走向完全不同的结局。\n\n结局有明有暗，有忠有奸。你可以在游戏内打开「结局图鉴」查看已达成与未达成的结局。',
    icon: 'ending'
  },
  {
    title: '保存进度',
    content: '记得随时保存你的游戏进度！你可以在三个存档槽位中保存不同的游戏历程。\n\n点击右上角的"存档"按钮即可保存。',
    icon: 'save'
  },
  {
    title: '成就系统',
    content: '在游戏过程中完成特定目标可以解锁成就！\n\n在主菜单或游戏内点击"成就"按钮查看你的成就收藏。',
    icon: 'achievement'
  },
  {
    title: '准备好了吗？',
    content: '记住，这是一个艰难的时代。每一个决定都需要深思熟虑。\n\n祝你仕途顺利！',
    icon: 'start'
  }
]

export default function TutorialModal(props: TutorialModalProps) {
  // 用 key 复位翻页进度。本组件在 GameScreen 里常驻挂载（教程与帮助各一个实例，
  // isOpen 只决定渲染分支、不卸载），所以 currentStep 会跨开关保留：
  // 玩家翻完 8 页帮助、关掉、再点「帮 助」，看到的会是最后一页
  // 「准备好了吗？」加一个「开始游戏」按钮，而不是第一页。
  // 每次从关闭变为打开都换一次 key → React 重建内部组件、状态回到第 0 页。
  const [resetKey, setResetKey] = useState(0)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (props.isOpen && !wasOpen.current) setResetKey(k => k + 1)
    wasOpen.current = props.isOpen
  }, [props.isOpen])

  return <TutorialModalBody key={resetKey} {...props} />
}

function TutorialModalBody({ isOpen, onClose, onComplete }: TutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0)

  // 对话框语义 + ESC + Tab 焦点陷阱 + 焦点还原 + 滚动锁
  // （教程与帮助会同时挂载两个实例，useId 保证标题 id 不冲突）
  const { getModalProps, dialogRef, titleId, handleOverlayClick } = useModal({
    open: isOpen,
    onClose
  })

  if (!isOpen) return null

  const currentStepData = tutorialSteps[currentStep]
  const isLastStep = currentStep === tutorialSteps.length - 1

  const handleNext = () => {
    if (isLastStep) {
      onComplete()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const node = (
    <div className="tutorial-overlay" onClick={handleOverlayClick}>
      <div className="tutorial-modal" ref={dialogRef} {...getModalProps()}>
        <button className="tutorial-close" onClick={onClose} aria-label="关闭">×</button>
        
        <div className="tutorial-content">
          <div className={`tutorial-icon ${currentStepData.icon}`} aria-hidden="true"></div>
          <h2 className="tutorial-title" id={titleId}>{currentStepData.title}</h2>
          <p className="tutorial-text">
            {currentStepData.content.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < currentStepData.content.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>
        </div>

        <div className="tutorial-progress">
          {tutorialSteps.map((_, i) => (
            <div 
              key={i} 
              className={`progress-dot ${i <= currentStep ? 'active' : ''}`}
            />
          ))}
        </div>

        <div className="tutorial-actions">
          {currentStep > 0 && (
            <button className="tutorial-btn secondary" onClick={handlePrev}>
              上一步
            </button>
          )}
          <button className="tutorial-btn primary" onClick={handleNext}>
            {isLastStep ? '开始游戏' : '下一步'}
          </button>
        </div>

        <div className="tutorial-skip">
          <button onClick={onComplete}>跳过教程</button>
        </div>
      </div>
    </div>
  )
  return createPortal(node, document.body)
}
