interface Props {
  size?: number
  className?: string
}

/** Google Maps 地點共用圖示。使用一般定位針，避免和準星或目前位置混淆。 */
export default function MapPinIcon({ size = 16, className = '' }: Props) {
  return (
    <svg
      className={`map-pin-icon ${className}`.trim()}
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
      <path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  )
}
