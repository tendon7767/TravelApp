import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number | undefined
  onChange: (value: number | undefined) => void
  /** 欄位清空時要送出的值：費用金額是 0，選填的上限則是 undefined。 */
  emptyAs?: number | undefined
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
  id?: string
}

/**
 * 受控數值欄位不能直接綁 number：
 * 按刪除鍵把內容清空時 Number('') 是 NaN、`|| 0` 又把 0 寫回去，
 * React 立刻重繪成「0」，看起來就像刪不掉。
 * 所以編輯途中保留字串草稿，離開欄位再跟模型同步。
 */
export default function NumberField({
  value,
  onChange,
  emptyAs = undefined,
  placeholder,
  className,
  style,
  id,
  'aria-label': ariaLabel,
}: Props) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value))
  const editing = useRef(false)

  useEffect(() => {
    if (!editing.current) setDraft(value === undefined ? '' : String(value))
  }, [value])

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      className={className}
      style={style}
      type="text"
      inputMode="decimal"
      /* 這個 App 沒有任何一格在收使用者自己的個資，所以正確的 autocomplete 就是 off ——
         給語意 token（cc-name、name、url…）反而會讓 iOS 拿聯絡人或信用卡來填。 */
      autoComplete="off"
      placeholder={placeholder}
      value={draft}
      onFocus={() => {
        editing.current = true
      }}
      onBlur={() => {
        editing.current = false
        setDraft(value === undefined ? '' : String(value))
      }}
      onChange={(e) => {
        const raw = e.target.value
        // 允許負號與小數點的中間狀態，例如剛打了「-」或「1.」
        if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return
        setDraft(raw)
        if (raw === '' || raw === '-' || raw === '.') {
          onChange(emptyAs)
          return
        }
        const n = Number(raw)
        if (!Number.isNaN(n)) onChange(n)
      }}
    />
  )
}
