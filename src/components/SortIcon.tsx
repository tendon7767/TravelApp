interface Props {
  size?: number
  className?: string
}

/** 首頁「旅程排序」鍵用：上下各一支箭頭，表示這是順序而不是篩選。 */
export default function SortIcon({ size = 16, className = '' }: Props) {
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
      <path d="M7 4v16M7 4 4 7.5M7 4l3 3.5" />
      <path d="M17 20V4M17 20l3-3.5M17 20l-3-3.5" />
    </svg>
  )
}
