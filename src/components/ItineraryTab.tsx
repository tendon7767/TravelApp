import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Item, Plan, Trip } from '../types'
import { eachDay, HALF_HOUR_SLOTS, shortDate, timeSortKey, todayISO } from '../lib/date'
import { isSubmitEnter } from '../lib/keys'
import { DAY_TEMPLATE } from '../lib/dayTemplate'
import { formatMoney, formatTotals, isUncategorized, itemTotals, mergeTotals, toHome } from '../lib/money'

interface Props {
  trip: Trip
  plan: Plan
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenExpenses: () => void
}

/**
 * 付款狀態是提醒用的，所以只標「還需要你處理」的那幾種。
 * 已刷卡沒什麼好記的，就不佔版面。
 */
const payBadge = (item: Item): { text: string; tone: 'warn' | 'info' } | null => {
  if (item.paymentStatus === '未付') return { text: '未付', tone: 'warn' }
  if (item.paymentStatus === '現場付') return { text: '現場付', tone: 'info' }
  if (item.paymentStatus === '自動結帳') {
    return { text: item.chargeDate ? `${shortDate(item.chargeDate).split(' ')[0]} 扣款` : '自動結帳', tone: 'info' }
  }
  return null
}

export default function ItineraryTab({ trip, plan, selectedId, onSelect, onOpenExpenses }: Props) {
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
    const map = new Map<string, Item[]>()
    for (const day of days) map.set(day, [])
    for (const item of items) map.get(item.date)?.push(item)
    for (const rows of map.values()) {
      rows.sort((a, b) => timeSortKey(a.startTime) - timeSortKey(b.startTime))
    }
    return map
  }, [days, items])

  const dayTotals = (day: string): Record<string, number> => {
    const acc: Record<string, number> = {}
    for (const item of byDay.get(day) ?? []) mergeTotals(acc, itemTotals(item))
    return acc
  }

  /** 已經有東西的時段就跳過，重複按不會長出一堆重複的「午餐」。 */
  const applyTemplate = (day: string) => {
    const taken = new Set((byDay.get(day) ?? []).map((i) => i.startTime))
    for (const row of DAY_TEMPLATE) {
      if (taken.has(row.time)) continue
      createItem({
        planId: plan.id,
        date: day,
        title: row.title,
        startTime: row.time,
        category: row.cat,
      })
    }
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
    setAddingOn(null)
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

            {rows.map((item) => (
              <button
                key={item.id}
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
                  {item.links.length > 0 && (
                    <span className="dim" style={{ fontSize: 12, marginLeft: 4 }}>◎</span>
                  )}
                  {isUncategorized(item) && <span className="warn" style={{ marginLeft: 6 }}>缺類型</span>}
                  {(() => {
                    const badge = payBadge(item)
                    if (!badge) return null
                    return (
                      <span
                        className="warn"
                        style={
                          badge.tone === 'info'
                            ? { marginLeft: 6, color: 'var(--accent)', background: 'var(--accent-bg)' }
                            : { marginLeft: 6 }
                        }
                      >
                        {badge.text}
                      </span>
                    )
                  })()}
                </span>
                <span className="rowmoney">{formatTotals(itemTotals(item))}</span>
              </button>
            ))}

            {addingOn === day ? (
              <div className="sec" style={{ display: 'flex', gap: 8 }}>
                <select
                  className="field mono"
                  style={{ width: 92, flex: 'none' }}
                  value={draft.startTime}
                  onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                  aria-label="時間"
                >
                  <option value="">--:--</option>
                  {HALF_HOUR_SLOTS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  className="field"
                  style={{ flex: 1, minWidth: 0 }}
                  placeholder="做什麼"
                  autoFocus
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  onKeyDown={(e) => isSubmitEnter(e) && submitDraft(day)}
                />
                <button className="btn btn-primary" onClick={() => submitDraft(day)}>
                  加入
                </button>
                <button className="btn" onClick={() => setAddingOn(null)} aria-label="關閉新增">
                  ✕
                </button>
              </div>
            ) : (
              <div className="row" style={{ gap: 0 }}>
                <button
                  className="dim"
                  style={{ flex: 1, textAlign: 'left', fontSize: 13, display: 'flex', gap: 9 }}
                  onClick={() => {
                    setAddingOn(day)
                    setDraft({ startTime: '', title: '' })
                  }}
                >
                  <span className="dot" />
                  <span className="rowtime">＋</span>
                  <span>新增項目</span>
                </button>
                <button
                  className="dim"
                  style={{ fontSize: 12, textDecoration: 'underline' }}
                  onClick={() => applyTemplate(day)}
                >
                  套用每日範本
                </button>
              </div>
            )}
          </section>
        )
      })}

      <button className="sec" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }} onClick={onOpenExpenses}>
        <strong style={{ fontSize: 14, fontWeight: 500 }}>全程合計 <span className="dim" style={{ fontWeight: 400 }}>· 看統計 ›</span></strong>
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
      </button>
    </>
  )
}
