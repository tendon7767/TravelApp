import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Item, Plan } from '../types'
import { formatTotals, itemTotals } from '../lib/money'
import { shortDate } from '../lib/date'
import CategoryIcon from './CategoryIcon'

interface Props {
  plan: Plan
  onPick: (id: string) => void
}

/** 標題、遊玩說明、備註、連結、費用項目全找 —— 「租車的預約連結在哪一列」這種問題不該用捲的。 */
const haystack = (i: Item): string =>
  [i.title, i.guide ?? '', ...i.notes.map((n) => n.text), ...i.links.map((l) => `${l.label} ${l.url}`), ...i.costs.map((c) => c.label)]
    .join(' ')
    .toLowerCase()

export default function SearchPanel({ plan, onPick }: Props) {
  const allItems = useStore((s) => s.data.items)
  const allReviews = useStore((s) => s.data.reviews)
  const [q, setQ] = useState('')

  /** 心得是獨立記錄，得另外併進搜尋範圍。 */
  const reviewText = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of allReviews) {
      if (r.deleted) continue
      map.set(r.itemId, `${map.get(r.itemId) ?? ''} ${r.text}`)
    }
    return map
  }, [allReviews])

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return allItems
      .filter(
        (i) =>
          i.planId === plan.id &&
          !i.deleted &&
          (haystack(i) + (reviewText.get(i.id) ?? '').toLowerCase()).includes(needle),
      )
      .sort((a, b) => (a.date === b.date ? (a.startTime ?? '').localeCompare(b.startTime ?? '') : a.date.localeCompare(b.date)))
  }, [allItems, plan.id, q, reviewText])

  return (
    <>
      <div className="sec">
        <input
          className="field"
          type="search"
          style={{ width: '100%' }}
          placeholder="搜尋行程、備註、連結、費用項目"
          autoComplete="off"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {q.trim() && hits.length === 0 && <div className="empty">找不到「{q.trim()}」。</div>}

      {hits.map((item) => (
        <button key={item.id} className="row" onClick={() => onPick(item.id)}>
          <CategoryIcon category={item.category} className="row-category-icon" />
          <span className="rowtitle">
            {item.title}
            <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
              {shortDate(item.date)} {item.startTime ?? ''}
            </div>
          </span>
          <span className="rowmoney">{formatTotals(itemTotals(item))}</span>
        </button>
      ))}
    </>
  )
}
