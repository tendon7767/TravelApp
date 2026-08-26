interface Props {
  size?: number
  className?: string
}

/** 住宿共用圖示。造型跟 CategoryIcon 的「住宿」同一組，但吃 currentColor，跟著所在的區塊上色。 */
export default function BedIcon({ size = 16, className = '' }: Props) {
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
      <path d="M4 19V6M20 19v-8H4M4 15h16" />
      <path d="M7 11V8h4a3 3 0 0 1 3 3" />
    </svg>
  )
}
