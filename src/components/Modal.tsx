import { useEffect, type ReactNode } from 'react'

interface Props {
  title: string
  onCancel: () => void
  onComplete: () => void
  children: ReactNode
}

/**
 * 手機從底部蓋上來、桌機置中。
 * 原本把編輯面板釘在列表最上方，點下方卡片時面板開在畫面外，看起來像沒反應。
 */
export default function Modal({ title, onCancel, onComplete, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [onCancel])

  return (
    <div className="backdrop" onClick={onCancel}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheethead">
          <strong style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{title}</strong>
        </div>
        <div className="sheetbody">{children}</div>
        <div className="sheetactions">
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={onComplete}>完成</button>
        </div>
      </div>
    </div>
  )
}
