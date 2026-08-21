import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { isSubmitEnter } from '../lib/keys'
import CloseIcon from './CloseIcon'

/*
 * 疊起來的彈窗共用的狀態。旅程彈窗裡再開編輯旅程，就是兩個獨立的 Modal 同時掛著：
 * 沒有這個計數的話，內層卸載時會直接把 body 的捲動鎖解掉（外層還開著），
 * 而兩層都在 document 上聽 Esc，按一次會兩層一起關。
 */
const stack: number[] = []
let nextToken = 0

interface Props {
  title: string
  onCancel: () => void
  /** 省略代表這個彈窗沒有「要不要套用」的問題（例如單純選一個），底部按鈕列整排不出現。 */
  onComplete?: () => void
  cancelLabel?: string
  completeLabel?: string
  completeDanger?: boolean
  /** 該填的沒填、或什麼都沒改。灰掉比按了沒反應誠實。 */
  completeDisabled?: boolean
  /**
   * 'picker' 是「點一個選項就關掉」的格式：四邊都留邊的置中彈窗，
   * 高度跟著選項長，不像 sheet 那樣貼著底部滿版。
   */
  variant?: 'sheet' | 'picker'
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
  completeLabel = '儲存',
  completeDanger = false,
  completeDisabled = false,
  variant = 'sheet',
  dirty = false,
  children,
}: Props) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  /* picker 不長這條：它四邊留邊、蓋板本來就好點，而且高度上限只有七成，多一條會擠掉一排選項。 */
  const closeBar = !onComplete && variant === 'sheet'
  const bodyRef = useRef<HTMLDivElement>(null)
  const requestCancel = useCallback(() => {
    if (dirty) setConfirmingCancel(true)
    else onCancel()
  }, [dirty, onCancel])

  /* 掛載順序就是疊放順序，最後掛上的那個是最上層。 */
  const tokenRef = useRef(0)
  useEffect(() => {
    nextToken += 1
    const token = nextToken
    tokenRef.current = token
    stack.push(token)
    document.body.classList.add('modal-open')
    return () => {
      // 不能只 pop：內層與外層的卸載順序不保證，把自己那一個挑掉才對。
      stack.splice(stack.indexOf(token), 1)
      if (stack.length === 0) document.body.classList.remove('modal-open')
    }
  }, [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 只有最上層那個吃 Esc，否則一次按鍵會把整疊關掉。
      if (tokenRef.current !== stack[stack.length - 1]) return
      if (confirmingCancel) setConfirmingCancel(false)
      else requestCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [confirmingCancel, requestCancel])

  /*
   * 手機上收鍵盤的出口。鍵盤升起時取消／完成會從釘住變成跟著內容捲，
   * 沒有這一手就只剩「戳畫面空白處」，而彈窗裡幾乎沒有空白處。
   * 集中在這裡蓋章而不是每個欄位各寫一次：新加的欄位自動就有，
   * 也不必要求每個彈窗記得寫。之後才長出來的欄位（例如筆記的下一行）
   * 蓋不到，但那種地方的 Enter 本來就是「開下一行」，維持預設才對。
   */
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    body.querySelectorAll('input:not([enterkeyhint])').forEach((el) => {
      if (!(el instanceof HTMLInputElement)) return
      if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'date') return
      el.setAttribute('enterkeyhint', 'done')
    })
  }, [])

  /** Enter 只收鍵盤，不送出 —— 送出的責任在底部那顆，這裡誤按不該關掉彈窗。 */
  const onBodyKeyDown = (e: KeyboardEvent) => {
    // 欄位自己處理掉的 Enter（筆記的「開下一行」）會 preventDefault，別搶。
    if (e.defaultPrevented || !isSubmitEnter(e)) return
    const target = e.target
    if (!(target instanceof HTMLInputElement)) return
    if (target.type === 'checkbox' || target.type === 'radio') return
    target.blur()
  }

  return createPortal(
    <>
      <div className="backdrop" data-variant={variant} onClick={requestCancel}>
        <div
          className="sheet"
          data-variant={variant}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sheethead">
            <strong style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{title}</strong>
            {/* 關閉一律留在標題列：鍵盤升起時底部的取消會捲進內容裡，這顆離鍵盤最遠。 */}
            <button className="icon-btn" onClick={requestCancel} aria-label="關閉">
              <CloseIcon />
            </button>
          </div>
          <div
            className="sheetbody"
            data-actions={onComplete || closeBar ? '' : undefined}
            ref={bodyRef}
            onKeyDown={onBodyKeyDown}
          >
            {children}
            {/*
             * 按鈕列寫在捲動區裡，用 sticky 假裝釘在底部；鍵盤升起時（:root[data-kb]）
             * 改成 static，它就自然落到內容尾端，不再貼著鍵盤上緣讓人誤按。
             * 切換只動一個 CSS 屬性、DOM 完全不搬，鍵盤動畫途中不會閃掉一幀。
             */}
            {onComplete && (
              <div className="sheetactions">
                <button className="btn" onClick={requestCancel}>{cancelLabel}</button>
                <button
                  className={completeDanger ? 'btn btn-danger' : 'btn btn-primary'}
                  onClick={onComplete}
                  disabled={completeDisabled}
                >
                  {completeLabel}
                </button>
              </div>
            )}
            {/*
             * 沒有「要不要套用」的 sheet，底部改放一條關閉。✕ 在右上角，
             * 單手拿手機時是最難按到的一個角，這條才在拇指的位置。
             * 整條就是那顆按鈕（膠囊只是裡面的 span），所以點哪裡都關得掉，
             * 不必外層再包一層 onClick —— 那會變成巢狀點擊區，得靠 stopPropagation 收尾。
             * 前提是這條只有這一個動作，之後要在這排加第二顆就得整條重想。
             */}
            {closeBar && (
              <button className="sheetactions sheet-close-wide" onClick={requestCancel}>
                {/* 這裡寫「關閉」不寫「取消」：沒有要套用的東西，就沒有「取消」可言。 */}
                <span className="btn">關閉</span>
              </button>
            )}
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
            <div className="sheetbody" data-actions="">
              <p style={{ margin: 0 }}>確定要取消並放棄這次的修改嗎？</p>
              <div className="sheetactions">
                <button className="btn" onClick={() => setConfirmingCancel(false)}>繼續編輯</button>
                <button className="btn btn-danger" onClick={onCancel}>放棄變更</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
