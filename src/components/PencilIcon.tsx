interface Props {
  size?: number
}

/** 「點這裡可以編輯」的共用提示圖示，造型與 TrashIcon 一致。 */
export default function PencilIcon({ size = 16 }: Props) {
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
      {/* 整個圖形在 viewBox 裡本來往下沉約 0.6 個單位（含筆畫寬算進去），上移補正。 */}
      <path d="M4 19.4h4l10-10a2.8 2.8 0 0 0-4-4L4 15.4v4Z" />
      <path d="M13.5 5.9l4 4" />
    </svg>
  )
}
