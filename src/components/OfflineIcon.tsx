interface Props {
  size?: number
  className?: string
}

/** 離線圖示。斷開的雲朵加一道斜線，和同步、同步失敗成套。 */
export default function OfflineIcon({ size = 20, className = '' }: Props) {
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
      <path d="M7.6 18.4a4.2 4.2 0 0 1-.6-8.3 5.6 5.6 0 0 1 2-3.4" />
      <path d="M11.4 6.2a5.6 5.6 0 0 1 6.1 3.4A3.9 3.9 0 0 1 18.4 17" />
      <path d="M3.2 3.2l17.6 17.6" />
    </svg>
  )
}
