import { useEffect, useState } from 'react'

interface Props {
  label: string
  /** 說清楚會刪掉什麼，例如「連同 31 筆行程」 */
  question: string
  onConfirm: () => void
  danger?: boolean
  confirmLabel?: string
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
        className={danger ? 'btn btn-sm btn-quiet-danger' : 'btn btn-sm'}
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
