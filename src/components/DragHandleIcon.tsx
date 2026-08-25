interface Props {
  size?: number
}

/**
 * 條列項目編輯時左邊的拖曳握把。三條橫線是各家清單重排通用的樣子。
 * 線畫滿 viewBox（3～21）：畫在正中央一小塊的話，同樣的 size 看起來只有別的圖示三分之一大。
 */
export default function DragHandleIcon({ size = 16 }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}
