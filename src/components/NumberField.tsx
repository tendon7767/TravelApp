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
      /*
       * type="search" 跟其他文字欄位同一個理由：Chrome 忽略 autocomplete="off"，
       * 只有「這是搜尋欄」擋得住鍵盤上那條自動完成的建議列。數字鍵盤是 inputMode
       * 決定的，跟 type 無關，所以換掉不影響輸入。
       */
      type="search"
      inputMode="decimal"
      enterKeyHint="done"
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
