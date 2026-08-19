interface Props {
  size?: number
  className?: string
}

/** 回饋分頁圖示。百分比，不綁定信用卡或電子支付其中一種。 */
export default function RewardsIcon({ size = 20, className = '' }: Props) {
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
      <circle cx="7.5" cy="7.5" r="2.8" />
      <circle cx="16.5" cy="16.5" r="2.8" />
      <path d="M19 5L5 19" />
    </svg>
  )
}
