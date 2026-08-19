interface Props {
  size?: number
  className?: string
}

/** 筆記分頁圖示。記事本同時涵蓋自由書寫與打包清單，不像勾選清單那樣偏向其中一半。 */
export default function NotesIcon({ size = 20, className = '' }: Props) {
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
      <path d="M6.5 3h13v18h-13a1.5 1.5 0 0 1 0-3h13" />
      <path d="M6.5 3v15" />
      <path d="M10.5 8h5.5" />
      <path d="M10.5 11.5h5.5" />
    </svg>
  )
}
