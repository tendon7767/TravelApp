interface Props {
  size?: number
}

/** 條列項目編輯時左邊的拖曳握把。三條橫線是各家清單重排通用的樣子。 */
export default function DragHandleIcon({ size = 16 }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 8h8M8 12h8M8 16h8" />
    </svg>
  )
}
