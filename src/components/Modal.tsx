import { useEffect, type ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * 手機從底部蓋上來、桌機置中。
 * 原本把編輯面板釘在列表最上方，點下方卡片時面板開在畫面外，看起來像沒反應。
 */
export default function Modal({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [onClose])

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheethead">
          <strong style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{title}</strong>
          <button className="btn btn-sm" onClick={onClose}>完成</button>
        </div>
        <div className="sheetbody">{children}</div>
      </div>
    </div>
  )
}
