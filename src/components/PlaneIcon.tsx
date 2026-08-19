interface Props {
  size?: number
  className?: string
}

/**
 * 航班動態查詢用。
 * 這裡刻意用實心剪影而不是跟其他圖示一樣的線稿 —— 15px 下線稿的機翼與尾翼會糊成一團。
 */
export default function PlaneIcon({ size = 16, className = '' }: Props) {
  return (
    <svg
      className={`plane-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        transform="rotate(45 12 12)"
        d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z"
      />
    </svg>
  )
}
