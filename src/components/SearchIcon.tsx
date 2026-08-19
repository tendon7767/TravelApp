interface Props {
  size?: number
  className?: string
}

/** 搜尋共用圖示。 */
export default function SearchIcon({ size = 20, className = '' }: Props) {
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
      <circle cx="10.8" cy="10.55" r="6.3" />
      <path d="M15.3 15.05L19.75 19.5" />
    </svg>
  )
}
