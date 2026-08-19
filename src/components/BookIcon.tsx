interface Props {
  size?: number
  className?: string
}

/** 行程說明區塊圖示。攤開的書，對應「這裡有什麼好吃好玩好看」的導覽性質。 */
export default function BookIcon({ size = 15, className = '' }: Props) {
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
      <path d="M12 6.6C10.4 5 8.4 4.4 3.6 4.4v13.2c4.8 0 6.8.6 8.4 2.2 1.6-1.6 3.6-2.2 8.4-2.2V4.4c-4.8 0-6.8.6-8.4 2.2Z" />
      <path d="M12 6.6v13.2" />
    </svg>
  )
}
