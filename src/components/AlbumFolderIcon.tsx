interface Props {
  size?: number
  className?: string
}

/** 從相簿選取圖示。資料夾裡的山景照片，比單張圖片更像是在既有圖庫中挑選。 */
export default function AlbumFolderIcon({ size = 18, className = '' }: Props) {
  return (
    <svg
      className={`inline-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 7h6l1.8 2H20a1.5 1.5 0 0 1 1.5 1.5v7A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5v-8A2.5 2.5 0 0 1 5 7Z" />
      <circle cx="16.2" cy="12.5" r="1" />
      <path d="m9 17 2.7-2.8 1.8 1.7 1.4-1.3 2.3 2.4" />
    </svg>
  )
}
