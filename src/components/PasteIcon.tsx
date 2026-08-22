interface Props {
  size?: number
}

/** 從剪貼簿貼上：剪貼板搭配向下進入內容區的箭頭。 */
export default function PasteIcon({ size = 17 }: Props) {
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
      <path d="M9 5h6M9.5 3.5h5a1.5 1.5 0 0 1 1.5 1.5v1H8V5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M8 5H6.5A2.5 2.5 0 0 0 4 7.5v11A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 17.5 5H16" />
      <path d="M12 9v7M9.5 13.5 12 16l2.5-2.5" />
    </svg>
  )
}
