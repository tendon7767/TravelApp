import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Item, Plan, Trip } from '../types'
import { eachDay, HALF_HOUR_SLOTS, shortDate, timeSortKey, todayISO } from '../lib/date'
import { isSubmitEnter } from '../lib/keys'
import { DAY_TEMPLATE } from '../lib/dayTemplate'
import { formatMoney, formatTotals, isUncategorized, itemTotals, mergeTotals, toHome } from '../lib/money'
import CategoryIcon from './CategoryIcon'

interface Props {
  trip: Trip
  plan: Plan
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenExpenses: () => void
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
  const [activeDay, setActiveDay] = useState(() => (days.includes(today) ? today : (days[0] ?? '')))
  const scrollRef = useRef<HTMLDivElement>(null)
  const daystripRef = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | undefined>(undefined)
  const programmaticDay = useRef<string | undefined>(undefined)

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

  useEffect(() => {
    setActiveDay((current) => (days.includes(current) ? current : (days.includes(today) ? today : (days[0] ?? ''))))
  }, [days, today])

  const updateActiveDay = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller || !days.length) return

    let next = days[0]
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      next = days[days.length - 1]
    } else {
      const focusLine = scroller.getBoundingClientRect().top + Math.min(scroller.clientHeight * 0.22, 96)
      for (const day of days) {
        const section = scroller.querySelector<HTMLElement>(`[data-day-section="${day}"]`)
        if (!section || section.getBoundingClientRect().top > focusLine) break
        next = day
      }
    }
    setActiveDay((current) => (current === next ? current : next))
  }, [days])

  const trackScroll = useCallback(() => {
    if (programmaticDay.current) return
    if (scrollFrame.current !== undefined) return
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = undefined
      updateActiveDay()
    })
  }, [updateActiveDay])

  useEffect(() => {
    updateActiveDay()
    return () => {
      if (scrollFrame.current !== undefined) window.cancelAnimationFrame(scrollFrame.current)
    }
  }, [updateActiveDay])

  useEffect(() => {
    const strip = daystripRef.current
    const index = days.indexOf(activeDay)
    const pill = index >= 0 ? (strip?.children[index] as HTMLElement | undefined) : undefined
    if (!strip || !pill) return
    strip.scrollTo({
      left: pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2,
      behavior: 'smooth',
    })
  }, [activeDay, days])

  const jumpTo = (day: string) => {
    const scroller = scrollRef.current
    const section = scroller?.querySelector<HTMLElement>(`[data-day-section="${day}"]`)
    programmaticDay.current = day
    setActiveDay(day)
    if (scroller && section) scroller.scrollTo({ top: section.offsetTop, behavior: 'smooth' })
  }

  const beginManualScroll = () => {
    programmaticDay.current = undefined
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
    <div className="itinerary-view">
      <div className="daystrip" ref={daystripRef}>
        {days.map((day, i) => (
          <button
            key={day}
            className="daypill"
            data-on={day === activeDay}
            data-today={day === today}
            onClick={() => jumpTo(day)}
            aria-current={day === activeDay ? 'date' : undefined}
          >
            D{i + 1}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="itinerary-scroll"
        onScroll={trackScroll}
        onTouchStart={beginManualScroll}
        onWheel={beginManualScroll}
      >
      {days.map((day, i) => {
        const rows = byDay.get(day) ?? []
        const totals = dayTotals(day)
        return (
          <section key={day} id={`day-${day}`} data-day-section={day}>
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
                <CategoryIcon category={item.category} className="row-category-icon" />
                <span className="rowtime">{item.startTime ?? ''}</span>
                <span className="rowtitle">
                  {item.title}
                  {item.links.some((link) => link.kind === 'map') && (
                    <span className="dim" style={{ fontSize: 12, marginLeft: 5 }} title="Google Maps 地點">⌖</span>
                  )}
                  {item.links.some((link) => link.kind === 'web') && (
                    <span className="dim" style={{ fontSize: 12, marginLeft: 4 }} title="相關連結">↗</span>
                  )}
                  {isUncategorized(item) && <span className="warn" style={{ marginLeft: 6 }}>缺類型</span>}
                  {item.notes.some((n) => n.showInOverview && n.text.trim()) && (
                    <span className="overview-note">
                      提醒：
                      {item.notes
                        .filter((n) => n.showInOverview && n.text.trim())
                        .map((n) => n.text.trim())
                        .join(' · ')}
                    </span>
                  )}
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
      </div>
    </div>
  )
}
