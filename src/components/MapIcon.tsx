interface Props {
  size?: number
  className?: string
}

/** 地圖區塊圖示。攤開的三摺地圖；底下的連結卡片才用定位針，標題與卡片各說各的層次。 */
export default function MapIcon({ size = 13.5, className = '' }: Props) {
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
      <path d="M2.8 6.4l6-2.4v13.6l-6 2.4V6.4Z" />
      <path d="M8.8 4l6.4 2.4v13.6L8.8 17.6" />
      <path d="M15.2 6.4l6-2.4v13.6l-6 2.4" />
    </svg>
  )
}
