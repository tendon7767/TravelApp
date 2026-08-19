interface Props {
  size?: number
  className?: string
}

/** 同步失敗圖示。沿用同步的雲朵，只換成驚嘆號 —— 出錯的是「沒送上去」，不是資料本身。顯示時由呼叫端轉成紅色。 */
export default function SyncErrorIcon({ size = 20, className = '' }: Props) {
  return (
    <svg
      className={`inline-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 18.5a4.2 4.2 0 0 1-.3-8.4 5.6 5.6 0 0 1 10.8-1.2A3.9 3.9 0 0 1 17.4 18.5H7Z" />
      <path d="M12 11.4v2.8" />
      <path d="M12 16.6h.01" />
    </svg>
  )
}
