import type { RefObject } from 'react'
import HomeIcon from './HomeIcon'
import ItineraryIcon from './ItineraryIcon'
import RewardsIcon from './RewardsIcon'
import NotesIcon from './NotesIcon'

/*
 * 花費統計不常看，從導航列移走，改由行程頁的「全程合計」點進去。
 * 旅程設定同理：進去多半只為了改名稱或日期，改完就出來，
 * 沒必要佔一格導航列 —— 改成點頂列的旅程名稱開彈窗。
 */
const TABS = [
  { key: 'itinerary', label: '行程', Icon: ItineraryIcon },
  { key: 'rewards', label: '回饋', Icon: RewardsIcon },
  { key: 'notes', label: '筆記', Icon: NotesIcon },
] as const

/**
 * 首頁與旅程頁共用同一條導航列 —— 兩頁各做一條的話，
 * 從首頁點「行程」進去時整條會重畫，看起來像換了一個 App。
 *
 * 首頁也是一格分頁而不是「離開」：在首頁時另外三格指的是最近看的那趟，
 * 所以首頁那一頁要把它高亮出來，讓人知道點下去會進到哪一趟。
 */
export default function TabBar({
  active,
  onSelect,
  tripDisabled = false,
  barRef,
}: {
  /** 'home' 或某個分頁的 key。 */
  active: string
  onSelect: (key: string) => void
  /** 一趟旅程都沒有時，另外三格沒有目的地。 */
  tripDisabled?: boolean
  barRef?: RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="tabbar" ref={barRef}>
      <button className="tab" data-on={active === 'home'} onClick={() => onSelect('home')}>
        <span className="tabicon">
          <HomeIcon size={21} />
        </span>
        首頁
      </button>
      {TABS.map((t) => (
        <button
          key={t.key}
          className="tab"
          data-on={active === t.key}
          disabled={tripDisabled}
          onClick={() => onSelect(t.key)}
        >
          <span className="tabicon">
            <t.Icon size={21} />
          </span>
          {t.label}
        </button>
      ))}
    </div>
  )
}
