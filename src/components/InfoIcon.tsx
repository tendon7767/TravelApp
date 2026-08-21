interface Props {
  size?: number
  className?: string
}

/** 說明的入口。點一下就地展開，不是浮層，也不是長按 —— 看不見的入口沒人會去按。 */
export default function InfoIcon({ size = 16, className = '' }: Props) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11V16.4" />
      <path d="M12 7.8V8" />
    </svg>
  )
}
