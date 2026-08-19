interface Props {
  size?: number
  className?: string
}

/**
 * 行程類型區塊圖示。標籤＝分類；類型本身的圖示由 CategoryIcon 顯示在值的位置。
 * 孔做成實心點、線寬 2.0：菱形外框面積大但線少，不補份量會比旁邊的圖示空。
 */
export default function TagIcon({ size = 13, className = '' }: Props) {
  return (
    <svg
      className={`inline-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.4 2.9H20a1.1 1.1 0 0 1 1.1 1.1v8.6a1.1 1.1 0 0 1-.33.78l-8.6 8.6a1.1 1.1 0 0 1-1.56 0l-8.6-8.6a1.1 1.1 0 0 1 0-1.56l8.6-8.6a1.1 1.1 0 0 1 .78-.33Z" />
      <circle cx="16.6" cy="7.4" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}
