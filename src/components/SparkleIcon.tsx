interface Props {
  size?: number
  className?: string
}

/** 地點分析按鈕。兩顆星火是「AI 產生」的通用語彙，跟旁邊的垃圾桶、複製同一套線條。 */
export default function SparkleIcon({ size = 20, className = '' }: Props) {
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
      <path d="M10 3.5 12.2 8.8 17.5 11 12.2 13.2 10 18.5 7.8 13.2 2.5 11 7.8 8.8Z" />
      <path d="M18.6 15.5 19.4 17.6 21.5 18.4 19.4 19.2 18.6 21.3 17.8 19.2 15.7 18.4 17.8 17.6Z" />
    </svg>
  )
}
