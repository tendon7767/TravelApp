interface Props {
  dir: 'up' | 'down'
  size?: number
}

/** 回饋頁支付方式的上移／下移。線寬與 PencilIcon 一致，三顆並排才不會一顆特別重。 */
export default function ChevronIcon({ dir, size = 16 }: Props) {
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
      <path d={dir === 'up' ? 'M5.5 15.5 12 9l6.5 6.5' : 'M5.5 8.5 12 15l6.5-6.5'} />
    </svg>
  )
}
