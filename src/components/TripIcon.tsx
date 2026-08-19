interface Props {
  size?: number
  className?: string
}

/** 旅程分頁：行李箱。其他三個分頁圖示都是抽象線條，這顆要一眼分得出來。 */
export default function TripIcon({ size = 16, className = '' }: Props) {
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
      <rect x="3.5" y="7.5" width="17" height="13" rx="2.5" />
      <path d="M9 7.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2.5" />
      <path d="M9 11.5v5" />
      <path d="M15 11.5v5" />
    </svg>
  )
}
