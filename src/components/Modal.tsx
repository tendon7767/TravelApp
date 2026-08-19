import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  onCancel: () => void
  onComplete: () => void
  cancelLabel?: string
  completeLabel?: string
  completeDanger?: boolean
  dirty?: boolean
  children: ReactNode
}

/**
 * 手機從底部蓋上來、桌機置中。
 * 原本把編輯面板釘在列表最上方，點下方卡片時面板開在畫面外，看起來像沒反應。
 */
export default function Modal({
  title,
  onCancel,
  onComplete,
  cancelLabel = '取消',
  completeLabel = '完成',
  completeDanger = false,
  dirty = false,
  children,
}: Props) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const requestCancel = useCallback(() => {
    if (dirty) setConfirmingCancel(true)
    else onCancel()
  }, [dirty, onCancel])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirmingCancel) setConfirmingCancel(false)
      else requestCancel()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [confirmingCancel, requestCancel])

  return createPortal(
    <>
      <div className="backdrop" onClick={requestCancel}>
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
            <button className="btn" onClick={requestCancel}>{cancelLabel}</button>
            <button className={completeDanger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onComplete}>
              {completeLabel}
            </button>
          </div>
        </div>
      </div>

      {confirmingCancel && (
        <div className="backdrop" onClick={() => setConfirmingCancel(false)}>
          <div
            className="sheet"
            role="alertdialog"
            aria-modal="true"
            aria-label="放棄未儲存的變更"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheethead">
              <strong style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>尚未儲存變更</strong>
            </div>
            <div className="sheetbody">
              <p style={{ margin: '12px 0 0' }}>確定要取消並放棄這次的修改嗎？</p>
            </div>
            <div className="sheetactions">
              <button className="btn" onClick={() => setConfirmingCancel(false)}>繼續編輯</button>
              <button className="btn btn-danger" onClick={onCancel}>放棄變更</button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
