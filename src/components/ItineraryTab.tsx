import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Item, Plan, Trip } from '../types'
import { addDays, eachDay, shortDate, timeSortKey, todayISO } from '../lib/date'
import { formatMoney, formatTotals, isUncategorized, itemTotals, mergeTotals, toHome } from '../lib/money'

interface Props {
  trip: Trip
  plan: Plan
  selectedId: string | null
  onSelect: (id: string) => void
}

/** 住宿佔多晚，後續日期顯示但不重複計價。 */
interface DayRow {
  item: Item
  nightIndex: number
}

export default function ItineraryTab({ trip, plan, selectedId, onSelect }: Props) {
  const allItems = useStore((s) => s.data.items)
  const items = useMemo(
    () => allItems.filter((i) => i.planId === plan.id && !i.deleted),
    [allItems, plan.id],
  )
  const createItem = useStore((s) => s.createItem)
  const today = todayISO()

  const days = useMemo(() => eachDay(trip.startDate, trip.endDate), [trip.startDate, trip.endDate])
  const [addingOn, setAddingOn] = useState<string | null>(null)
  const [draft, setDraft] = useState({ startTime: '', title: '' })

  const byDay = useMemo(() => {
    const map = new Map<string, DayRow[]>()
    for (const day of days) map.set(day, [])
    for (const item of items) {
      const nights = Math.max(1, item.nights ?? 1)
      for (let n = 0; n < nights; n++) {
        const day = addDays(item.date, n)
        map.get(day)?.push({ item, nightIndex: n })
      }
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => timeSortKey(a.item.startTime) - timeSortKey(b.item.startTime))
    }
    return map
  }, [days, items])

  const dayTotals = (day: string): Record<string, number> => {
    const acc: Record<string, number> = {}
    for (const { item, nightIndex } of byDay.get(day) ?? []) {
      if (nightIndex === 0) mergeTotals(acc, itemTotals(item))
    }
    return acc
  }

  const jumpTo = (day: string) => {
    document.getElementById(`day-${day}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const submitDraft = (day: string) => {
    if (!draft.title.trim()) return
    createItem({
      planId: plan.id,
      date: day,
      title: draft.title.trim(),
      startTime: draft.startTime || undefined,
    })
    setDraft({ startTime: '', title: '' })
  }

  return (
    <>
      <div className="daystrip">
        {days.map((day, i) => (
          <button
            key={day}
            className="daypill"
            data-today={day === today}
            onClick={() => jumpTo(day)}
          >
            D{i + 1}
          </button>
        ))}
      </div>

      {days.map((day, i) => {
        const rows = byDay.get(day) ?? []
        const totals = dayTotals(day)
        return (
          <section key={day} id={`day-${day}`}>
            <div className="dayhead">
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                Day {i + 1} · {shortDate(day)}
                {day === today && <span className="chip chip-accent" style={{ marginLeft: 6 }}>今天</span>}
              </span>
              <span className="mono dim" style={{ fontSize: 12 }}>
                {formatTotals(totals) || '—'}
              </span>
            </div>

            {rows.map(({ item, nightIndex }) => {
              const nights = Math.max(1, item.nights ?? 1)
              const totalsForItem = itemTotals(item)
              return (
                <button
                  key={`${item.id}-${nightIndex}`}
                  className="row"
                  data-sel={item.id === selectedId}
                  onClick={() => onSelect(item.id)}
                >
                  <span
                    className="dot"
                    style={{ background: item.category ? `var(--cat-${item.category})` : 'transparent' }}
                  />
                  <span className="rowtime">{item.startTime ?? ''}</span>
                  <span className="rowtitle">
                    {item.title}
                    {nights > 1 && (
                      <span className="dim" style={{ fontSize: 12 }}>
                        （第 {nightIndex + 1}/{nights} 晚）
                      </span>
                    )}
                    {item.links.length > 0 && nightIndex === 0 && (
                      <span className="dim" style={{ fontSize: 12, marginLeft: 4 }}>◎</span>
                    )}
                    {isUncategorized(item) && nightIndex === 0 && (
                      <span className="warn" style={{ marginLeft: 6 }}>缺類型</span>
                    )}
                  </span>
                  <span className="rowmoney">
                    {nightIndex === 0 ? formatTotals(totalsForItem) : ''}
                  </span>
                </button>
              )
            })}

            {addingOn === day ? (
              <div className="sec" style={{ display: 'flex', gap: 8 }}>
                <input
                  className="field mono"
                  style={{ width: 92 }}
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                  aria-label="時間"
                />
                <input
                  className="field"
                  style={{ flex: 1 }}
                  placeholder="做什麼"
                  autoFocus
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && submitDraft(day)}
                />
                <button className="btn btn-primary" onClick={() => submitDraft(day)}>
                  加入
                </button>
                <button className="btn" onClick={() => setAddingOn(null)}>
                  完成
                </button>
              </div>
            ) : (
              <button
                className="row dim"
                style={{ fontSize: 13 }}
                onClick={() => {
                  setAddingOn(day)
                  setDraft({ startTime: '', title: '' })
                }}
              >
                <span className="dot" />
                <span className="rowtime">＋</span>
                <span className="rowtitle">新增項目</span>
              </button>
            )}
          </section>
        )
      })}

      <div className="sec" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 14, fontWeight: 500 }}>全程合計</strong>
        <span className="mono" style={{ fontSize: 14 }}>
          {(() => {
            const all: Record<string, number> = {}
            for (const item of items) mergeTotals(all, itemTotals(item))
            const home = toHome(all, trip)
            return `${formatTotals(all) || '—'}${
              Object.keys(all).length > 1 || !all[trip.homeCurrency]
                ? ` ≈ ${formatMoney(home, trip.homeCurrency)}`
                : ''
            }`
          })()}
        </span>
      </div>
    </>
  )
}
