interface Props {
  size?: number
  className?: string
}

/**
 * 通路圖示。通路實際上問的就是「這筆是在哪家店刷的」（大國藥妝、BIC CAMERA），
 * 所以用店面而不是標籤 —— 標籤在這個專案裡已經是行程類型的意思（見 TagIcon）。
 * 遮陽棚做成一整條而不是波浪，13px 下波浪會糊成一團看不出來。
 */
export default function StoreIcon({ size = 13, className = '' }: Props) {
  return (
    <svg
      className={`inline-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.2 4.6h17.6l1.1 4.2a3.1 3.1 0 0 1-6.1.9 3.1 3.1 0 0 1-6.1 0 3.1 3.1 0 0 1-6.1-.9Z" />
      <path d="M4.4 11.4v7.9h15.2v-7.9" />
      <path d="M9.6 19.3v-4.6h4.8v4.6" />
    </svg>
  )
}
