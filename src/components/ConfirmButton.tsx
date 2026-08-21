import { useEffect, useState, type ReactNode } from 'react'

interface Props {
  /** 收合時的樣子；可以是文字，也可以是圖示。 */
  label: ReactNode
  /** 說清楚會刪掉什麼，例如「連同 31 筆行程」 */
  question: string
  onConfirm: () => void
  danger?: boolean
  confirmLabel?: string
  /** 收合時要套在按鈕上的額外 class，例如做成無外框的圖示鍵。 */
  className?: string
  /** label 是圖示時要另外給無障礙名稱。 */
  ariaLabel?: string
}

/**
 * 兩段式確認。不用 window.confirm，因為那在加到主畫面的 PWA 裡樣式不受控，
 * 而且會擋住整個畫面看不到自己正要刪掉什麼。
 */
export default function ConfirmButton({
  label,
  question,
  onConfirm,
  danger = true,
  confirmLabel = '刪除',
  className = 'btn btn-sm',
  ariaLabel,
}: Props) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 6000)
    return () => clearTimeout(timer)
  }, [armed])

  if (!armed) {
    return (
      <button
        className={danger ? `${className} btn-quiet-danger` : className}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setArmed(true)}
      >
        {label}
      </button>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--danger)' }}>{question}</span>
      <button className="btn btn-sm" onClick={() => setArmed(false)}>
        取消
      </button>
      <button
        className="btn btn-sm"
        style={{ background: 'var(--danger)', color: '#fff', borderColor: 'transparent' }}
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
    </span>
  )
}
