interface Props {
  size?: number
  className?: string
}

/** 行程照片共用圖示。方框裡的山與太陽，是最通用的「圖片」符號。 */
export default function PhotoIcon({ size = 16, className = '' }: Props) {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5-5-6.5 8" />
    </svg>
  )
}
