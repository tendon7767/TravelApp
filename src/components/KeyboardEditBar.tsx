import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import EditActions from './EditActions'
import Modal from './Modal'

/*
 * 會叫出鍵盤的欄位才需要這一排。日期、勾選、檔案這些按下去是選單或系統面板，
 * 鍵盤不會升起，--kb 是 0，這排就會落在彈窗自己的取消／完成上面。
 */
const KEYBOARD_FIELD =
  'textarea, [contenteditable=""], [contenteditable="true"], ' +
  'input:not([type]), input[type="text"], input[type="number"], input[type="search"], ' +
  'input[type="url"], input[type="email"], input[type="tel"], input[type="password"]'

const isKeyboardField = (node: unknown): node is HTMLElement =>
  node instanceof HTMLElement && node.matches(KEYBOARD_FIELD)

/**
 * 鍵盤升起時浮在鍵盤上緣的「取消編輯／完成編輯」。
 *
 * 彈窗底部那對取消／完成管的是整個彈窗、固定在頁底，鍵盤升起時看不到；
 * 這一對管的是「這次鍵盤期間打的字」：升起那一刻對草稿拍一張快照，
 * 取消就整個還原回去（中途換過幾個欄位都算同一次），完成則是留著並收鍵盤。
 * 兩顆都不寫進資料 —— 要寫回去仍然是彈窗底部那顆完成的事。
 *
 * 行為比照詳細行程與心得的同名按鈕：沒改動時完成按不下去，
 * 取消有改動時先問過再丟。
 *
 * 只在觸控裝置上出現。桌機聚焦欄位不會有軟體鍵盤，--kb 是 0，
 * 這排會直接壓在彈窗自己的取消／完成上面 —— 而那一排在桌機本來就看得到。
 */
export default function KeyboardEditBar<T>({
  value,
  onRestore,
}: {
  /** 這個彈窗的草稿。整包還原，所以要包含所有會被鍵盤改到的欄位。 */
  value: T
  onRestore: (value: T) => void
}) {
  /* 沒有軟體鍵盤就沒有這排的存在意義。桌機與觸控的差別問 pointer，
     Android 的 --kb 恆為 0（版面視窗跟著縮），拿它分不出來。 */
  const softKeyboard = useRef(window.matchMedia('(pointer: coarse)').matches)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const snapshot = useRef<T>(value)
  /** 問「要不要放棄」時得先收鍵盤，答「繼續編輯」要回得去原本那格。 */
  const lastField = useRef<HTMLElement | null>(null)
  // 事件處理器裡要拿到最新的草稿，但它只在掛載時裝一次。
  const latest = useRef(value)
  latest.current = value

  useEffect(() => {
    if (!softKeyboard.current) return
    const onFocusIn = (event: FocusEvent) => {
      if (!isKeyboardField(event.target)) return
      lastField.current = event.target
      setEditing((current) => {
        if (!current) snapshot.current = latest.current
        return true
      })
    }
    /*
     * 欄位之間互跳時，focusout 會早於下一個 focusin —— 當場收掉會閃一下，
     * 而且那次跳轉本來就該算同一次編輯。等到下一輪再看焦點真正落在哪裡。
     */
    const onFocusOut = () => {
      setTimeout(() => {
        if (!isKeyboardField(document.activeElement)) setEditing(false)
      }, 0)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  if (!softKeyboard.current) return null
  if (!editing && !confirming) return null

  const dirty = JSON.stringify(value) !== JSON.stringify(snapshot.current)

  const stopEditing = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setEditing(false)
  }

  /*
   * 問話的彈窗會被鍵盤蓋住（彈窗不再隨鍵盤上移），所以先收鍵盤再問。
   * 這也是為什麼要記住剛才那一格：答「繼續編輯」得自己送回去。
   */
  const requestCancel = () => {
    if (!dirty) {
      stopEditing()
      return
    }
    stopEditing()
    setConfirming(true)
  }

  const discard = () => {
    onRestore(snapshot.current)
    setConfirming(false)
    setEditing(false)
  }

  return createPortal(
    <>
      {editing && !confirming && (
        <EditActions
          className="kb-actions"
          keepFocus
          dirty={dirty}
          onCancel={requestCancel}
          onComplete={stopEditing}
        />
      )}

      {confirming && (
        <Modal
          title="尚未儲存變更"
          onCancel={() => {
            setConfirming(false)
            lastField.current?.focus()
          }}
          onComplete={discard}
          cancelLabel="繼續編輯"
          completeLabel="放棄變更"
          completeDanger
        >
          <p style={{ margin: '12px 0 0' }}>確定要取消編輯並放棄這次的全部修改嗎？</p>
        </Modal>
      )}
    </>,
    document.body,
  )
}
