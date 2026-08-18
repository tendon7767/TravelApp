import type { ItineraryCategory } from '../types'

interface Props {
  category?: ItineraryCategory
  size?: number
  className?: string
}

/** 行程類型共用圖示。維持線框造型，深色規劃版與淺色實際版都能清楚辨識。 */
export default function CategoryIcon({ category, size = 18, className = '' }: Props) {
  const paths = (() => {
    switch (category) {
      case '景點':
        return (
          <>
            <path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z" />
            <circle cx="12" cy="10" r="2" />
          </>
        )
      case '交通':
        return (
          <>
            <path d="M5 16V9.5L7 5h10l2 4.5V16" />
            <path d="M4 11h16M7 16v2M17 16v2" />
            <circle cx="7" cy="14" r="1" />
            <circle cx="17" cy="14" r="1" />
          </>
        )
      case '餐飲':
        return (
          <>
            <path d="M7 3v7M4.5 3v4.5A2.5 2.5 0 0 0 7 10M9.5 3v4.5A2.5 2.5 0 0 1 7 10v11" />
            <path d="M16 3c-2 2-2.5 6.5 0 8v10M16 3c2 1.5 3 4.5 2 8h-2" />
          </>
        )
      case '住宿':
        return (
          <>
            <path d="M4 19V6M20 19v-8H4M4 15h16" />
            <path d="M7 11V8h4a3 3 0 0 1 3 3" />
          </>
        )
      case '活動':
        return (
          <>
            <path d="M5 6h14v4a2 2 0 0 0 0 4v4H5v-4a2 2 0 0 0 0-4V6Z" />
            <path d="M12 7.5v2M12 11v2M12 14.5v2" />
          </>
        )
      case '購物':
        return (
          <>
            <path d="M5 8h14l-1 12H6L5 8Z" />
            <path d="M9 9V6a3 3 0 0 1 6 0v3" />
          </>
        )
      case '其他':
        return (
          <>
            <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
          </>
        )
      default:
        return (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .6-1.5 1.1-1.5 2.2M12 16.8v.2" />
          </>
        )
    }
  })()

  return (
    <span
      className={`category-icon ${className}`.trim()}
      style={{
        width: size,
        height: size,
        color: category ? `var(--cat-${category})` : 'var(--text-3)',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {paths}
      </svg>
    </span>
  )
}
