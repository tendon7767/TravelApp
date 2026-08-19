interface Props {
  size?: number
  className?: string
}

/** 行程分頁圖示。節點串成一條線，對應行程頁本身的時間軸結構。 */
export default function ItineraryIcon({ size = 20, className = '' }: Props) {
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
      <path d="M7 4.5v15" />
      <circle cx="7" cy="7.5" r="2" />
      <circle cx="7" cy="16.5" r="2" />
      <path d="M12 7.5h8" />
      <path d="M12 16.5h8" />
    </svg>
  )
}
