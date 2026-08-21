interface Props {
  size?: number
  className?: string
}

/** 首頁（旅程列表）分頁圖示。 */
export default function HomeIcon({ size = 20, className = '' }: Props) {
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
      <path d="M4 10.4 12 4l8 6.4" />
      <path d="M5.8 11.8v7.7h12.4v-7.7" />
      <path d="M9.8 19.5v-5h4.4v5" />
    </svg>
  )
}
