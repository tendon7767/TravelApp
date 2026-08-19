interface Props {
  size?: number
  className?: string
}

/** 同步共用圖示。雲朵點出資料是往雲端硬碟去的，和離線、同步失敗共用同一個雲朵輪廓，三個狀態切換時形狀有延續性。 */
export default function SyncIcon({ size = 20, className = '' }: Props) {
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
      <path d="M9.6 13.6a2.6 2.6 0 0 1 4.4-1.3" />
      <path d="M14.4 10.6v2.1h-2.1" />
    </svg>
  )
}
