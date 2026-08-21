interface Props {
  size?: number
  className?: string
}

/** 亮色主題的圖示。八條放射線比照 GearIcon 由 (12,12) 產生，在方形按鈕裡自然置中。 */
export default function SunIcon({ size = 20, className = '' }: Props) {
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
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 2.4V4.2" />
      <path d="M18.8 5.2L17.5 6.5" />
      <path d="M21.6 12H19.8" />
      <path d="M18.8 18.8L17.5 17.5" />
      <path d="M12 21.6V19.8" />
      <path d="M5.2 18.8L6.5 17.5" />
      <path d="M2.4 12H4.2" />
      <path d="M5.2 5.2L6.5 6.5" />
    </svg>
  )
}
