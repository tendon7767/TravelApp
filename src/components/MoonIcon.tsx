interface Props {
  size?: number
  className?: string
}

/**
 * 深色主題的圖示。缺口用一段弧切出來而不是疊第二個圓 ——
 * 疊圓要填色才蓋得掉，而這組圖示全部是 currentColor 的線稿。
 */
export default function MoonIcon({ size = 20, className = '' }: Props) {
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
      <path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" />
    </svg>
  )
}
