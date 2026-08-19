interface Props {
  size?: number
  className?: string
}

/**
 * 相關連結區塊圖示。地球泛指網頁，和地圖的定位針區別最大。
 * 經線只畫單邊而不是整圈：半徑 8.8 的圓周本身就要 55 個單位，
 * 再加赤道與整圈經線會讓這顆比其他區塊圖示重三成。
 */
export default function GlobeIcon({ size = 13.5, className = '' }: Props) {
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
      <circle cx="12" cy="12" r="8.8" />
      <path d="M3.2 12h17.6" />
      <path d="M12 3.2a14.6 14.6 0 0 1 0 17.6" />
    </svg>
  )
}
