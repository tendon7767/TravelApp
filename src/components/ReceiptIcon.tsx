interface Props {
  size?: number
  className?: string
}

/** 收據照片共用圖示。摺角單據加上金額符號，和行程照片的風景圖區別明顯。 */
export default function ReceiptIcon({ size = 16, className = '' }: Props) {
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
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4" />
      <path d="M12 10.5v7" />
      <path d="M13.8 12H11a1.6 1.6 0 0 0 0 3.2h2a1.6 1.6 0 0 1 0 3.2h-2.8" />
    </svg>
  )
}
