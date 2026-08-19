interface Props {
  size?: number
  className?: string
}

/** 費用區塊圖示。錢幣不綁定支付工具，也和收據的直式單據分得開。 */
export default function MoneyIcon({ size = 14, className = '' }: Props) {
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
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 6.8v10.4" />
      <path d="M14.4 9.2h-3.6a2 2 0 0 0 0 4h2.4a2 2 0 0 1 0 4H9.4" />
    </svg>
  )
}
