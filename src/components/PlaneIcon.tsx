interface Props {
  size?: number
  className?: string
}

/** 航班動態查詢用。機身朝右上，小尺寸下和定位針、連結圖示不會混淆。 */
export default function PlaneIcon({ size = 16, className = '' }: Props) {
  return (
    <svg
      className={`plane-icon ${className}`.trim()}
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
      <path d="M10.4 13.6 3.2 11.2V8.8l7.2 1.4 3.6-3.6a2 2 0 0 1 2.8 2.8l-3.6 3.6 1.4 7.2h-2.4l-1.8-6.6Z" />
    </svg>
  )
}
