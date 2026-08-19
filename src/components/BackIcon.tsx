interface Props {
  size?: number
  className?: string
}

/** 返回上一層共用圖示。單純的雪佛龍，和關閉的 ✕ 分工清楚。 */
export default function BackIcon({ size = 20, className = '' }: Props) {
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
      <path d="M15 4.5L7.5 12l7.5 7.5" />
    </svg>
  )
}
