import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Item, Plan } from '../types'
import { formatTotals, itemTotals } from '../lib/money'
import { shortDate } from '../lib/date'

interface Props {
  plan: Plan
  onPick: (id: string) => void
  onClose: () => void
}

/** 標題、遊玩說明、備註、連結、費用項目全找 —— 「租車的預約連結在哪一列」這種問題不該用捲的。 */
const haystack = (i: Item): string =>
  [i.title, i.guide ?? '', i.review ?? '', ...i.notes, ...i.links.map((l) => `${l.label} ${l.url}`), ...i.costs.map((c) => c.label)]
    .join(' ')
    .toLowerCase()

export default function SearchPanel({ plan, onPick, onClose }: Props) {
  const allItems = useStore((s) => s.data.items)
  const [q, setQ] = useState('')

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return allItems
      .filter((i) => i.planId === plan.id && !i.deleted && haystack(i).includes(needle))
      .sort((a, b) => (a.date === b.date ? (a.startTime ?? '').localeCompare(b.startTime ?? '') : a.date.localeCompare(b.date)))
  }, [allItems, plan.id, q])

  return (
    <>
      <div className="sec" style={{ display: 'flex', gap: 8 }}>
        <input
          className="field"
          style={{ flex: 1, minWidth: 0 }}
          placeholder="搜尋行程、備註、連結、費用項目"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn" onClick={onClose} aria-label="關閉搜尋">
          ✕
        </button>
      </div>

      {q.trim() && hits.length === 0 && <div className="empty">找不到「{q.trim()}」。</div>}

      {hits.map((item) => (
        <button key={item.id} className="row" onClick={() => onPick(item.id)}>
          <span
            className="dot"
            style={{ background: item.category ? `var(--cat-${item.category})` : 'transparent' }}
          />
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
