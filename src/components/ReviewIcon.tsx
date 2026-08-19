interface Props {
  size?: number
  className?: string
}

/**
 * 心得區塊圖示。對話泡泡，對應這個區塊「一人一則、各寫各的」的結構。
 * 泡泡裡補兩條內文線：只有一圈外框時墨量比其他區塊圖示少四分之一，看起來單薄。
 */
export default function ReviewIcon({ size = 14, className = '' }: Props) {
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
      <path d="M20.4 14.2a2.2 2.2 0 0 1-2.2 2.2H7.8L3.6 20.4V5.6a2.2 2.2 0 0 1 2.2-2.2h12.4a2.2 2.2 0 0 1 2.2 2.2v8.6Z" />
      <path d="M7.6 8.2h8.8" />
      <path d="M7.6 11.8h5.6" />
    </svg>
  )
}
