interface Props {
  size?: number
  className?: string
}

/** 拍照操作圖示。經典相機輪廓，和相簿／資料夾的選取語意分開。 */
export default function CameraIcon({ size = 18, className = '' }: Props) {
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
      <path d="M5 7.5h3l1.3-2h5.4l1.3 2h3A2 2 0 0 1 21 9.5v8A2 2 0 0 1 19 19H5a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  )
}
