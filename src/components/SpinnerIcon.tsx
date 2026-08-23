interface Props {
  size?: number
  className?: string
}

/** 只有左下角的浮標會用到。詳細頁那顆按鈕靠灰掉表示進行中，不再重複講同一件事。 */
export default function SpinnerIcon({ size = 14, className = '' }: Props) {
  return (
    <svg
      className={`inline-icon spinner-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  )
}
