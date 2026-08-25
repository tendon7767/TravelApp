interface Props {
  size?: number
}

/** 「這一行是文字段落」的標記，跟 CheckSquareIcon 成對，兩顆的視覺份量要一樣。 */
export default function BulletIcon({ size = 16 }: Props) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
    </svg>
  )
}
