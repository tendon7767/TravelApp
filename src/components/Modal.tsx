import { useCallback, useEffect, useState, type ReactNode } from 'react'

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

  /**
   * iOS 的鍵盤不會縮小 position: fixed 依據的版面視窗，蓋板照樣是整個螢幕高，
   * 底部的「取消／完成」就被鍵盤蓋住 —— 有 autoFocus 的表單一打開就看不到按鈕。
   * 把可見視窗的高度、位移與鍵盤佔掉的高度寫成 CSS 變數，交給 styles.css 用。
   */
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const apply = () => {
      root.style.setProperty('--vv-h', `${vv.height}px`)
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`)
      const keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--vv-kb', `${keyboard}px`)
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      root.style.removeProperty('--vv-h')
      root.style.removeProperty('--vv-top')
      root.style.removeProperty('--vv-kb')
    }
  }, [])

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

  return (
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
            <button className="btn btn-sm" onClick={requestCancel}>{cancelLabel}</button>
            <strong className="sheethead-title">{title}</strong>
            <button
              className={completeDanger ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary'}
              onClick={onComplete}
            >
              {completeLabel}
            </button>
          </div>
          <div className="sheetbody">{children}</div>
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
              <strong className="sheethead-title" style={{ textAlign: 'left' }}>尚未儲存變更</strong>
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
    </>
  )
}
