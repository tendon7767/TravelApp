interface Props {
  size?: number
  className?: string
}

/**
 * 設定共用圖示。齒不與輪框相連，改成八條放射短線 ——
 * 齒和框連在一起時，1.8 的線寬會在 20px 以下把齒縫填滿而糊成一圈輪框。
 * 全部以 (12,12) 為圓心產生，在方形按鈕裡本來就是正中央。
 */
export default function GearIcon({ size = 20, className = '' }: Props) {
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
      <circle cx="12" cy="12" r="6.4" />
      <path d="M12.00 4.10L12.00 2.00" />
      <path d="M17.59 6.41L19.07 4.93" />
      <path d="M19.90 12.00L22.00 12.00" />
      <path d="M17.59 17.59L19.07 19.07" />
      <path d="M12.00 19.90L12.00 22.00" />
      <path d="M6.41 17.59L4.93 19.07" />
      <path d="M4.10 12.00L2.00 12.00" />
      <path d="M6.41 6.41L4.93 4.93" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  )
}
