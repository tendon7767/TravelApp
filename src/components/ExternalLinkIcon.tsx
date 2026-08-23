interface Props {
  size?: number
  className?: string
}

/**
 * 「開啟」動作專用：外框加一支斜箭頭，講的是「在新分頁打開」這個動作。
 * 標示「這一列是網頁連結」的記號仍用 LinkIcon 的鎖鏈 —— 筆記頁的連結列
 * 兩者同時在場，用同一顆圖示會看不出左邊是分類、右邊是按鈕。
 */
export default function ExternalLinkIcon({ size = 16, className = '' }: Props) {
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
      <path d="M13 5h6v6" />
      <path d="M19 5l-8 8" />
      <path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" />
    </svg>
  )
}
