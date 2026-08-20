interface Props {
  size?: number
}

/** 「目前選中的就是這個」的共用標記。和 CloseIcon 的 ✕ 分工清楚。 */
export default function CheckIcon({ size = 14 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12.5l5.5 5.5L20 6.5" />
    </svg>
  )
}
