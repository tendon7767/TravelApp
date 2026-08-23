interface Props {
  size?: number
}

/** 所有資料刪除按鈕共用；關閉視窗仍使用 X，不混淆兩種動作。
 *  刻意只留輪廓，桶身裡的兩條直線在 19px 下只是糊掉的雜訊。 */
export default function TrashIcon({ size = 16 }: Props) {
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
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
    </svg>
  )
}
