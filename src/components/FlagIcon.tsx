interface Props {
  size?: number
  className?: string
}

/**
 * 基本資訊區塊圖示。旗面加寬、凹角加深，凹角太淺時線寬會把缺口填掉而糊成方塊。
 * 線寬用 2.0 而非其他圖示的 1.8：這是「大外框、少細節」的形狀，
 * 同樣尺寸下墨量只有其他圖示的八成，加粗才不會看起來比旁邊輕。
 */
export default function FlagIcon({ size = 15.5, className = '' }: Props) {
  return (
    <svg
      className={`inline-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 21V3.4" />
      <path d="M5 4.8h14.2l-3.4 4.3 3.4 4.3H5" />
    </svg>
  )
}
