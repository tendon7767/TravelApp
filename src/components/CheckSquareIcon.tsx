interface Props {
  size?: number
}

/**
 * 「這一行是勾選項」的標記。用畫的不用 ☑ 那個字元：
 * U+2611 在 iOS 會被當成 emoji 算繪（變成彩色、大小由字型決定），控不住。
 */
export default function CheckSquareIcon({ size = 16 }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </svg>
  )
}
