interface Props {
  size?: number
  className?: string
}

/** 備註區塊圖示。右下摺角的便利貼。 */
export default function StickyNoteIcon({ size = 15, className = '' }: Props) {
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
      <path d="M3.6 4.4h16.8v10.2l-5.8 5.8H3.6V4.4Z" />
      <path d="M20.4 14.6h-5.8v5.8" />
    </svg>
  )
}
