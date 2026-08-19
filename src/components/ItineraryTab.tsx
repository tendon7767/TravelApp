import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Item, Plan, Trip } from '../types'
import { eachDay, HALF_HOUR_SLOTS, shortDate, timeSortKey, todayISO } from '../lib/date'
import { isSubmitEnter } from '../lib/keys'
import { formatMoney, formatTotals, isUncategorized, itemTotals, mergeTotals, toHome } from '../lib/money'
import CategoryIcon from './CategoryIcon'
import MapPinIcon from './MapPinIcon'
import LinkIcon from './LinkIcon'
import PhotoIcon from './PhotoIcon'
import ReceiptIcon from './ReceiptIcon'

interface Props {
  trip: Trip
  plan: Plan
  selectedId: string | null
  copiedItem?: Item
  onSelect: (id: string) => void
  onPaste: (date: string) => void
  onClearCopied: () => void
  onOpenExpenses: () => void
}

export default function ItineraryTab({
  trip,
  plan,
  selectedId,
  copiedItem,
  onSelect,
  onPaste,
  onClearCopied,
  onOpenExpenses,
}: Props) {
  const allItems = useStore((s) => s.data.items)
  const allPhotos = useStore((s) => s.data.photos)
  const pendingPhotos = useStore((s) => s.pendingPhotos)
  const items = useMemo(
    () => allItems.filter((i) => i.planId === plan.id && !i.deleted),
    [allItems, plan.id],
  )
  const createItem = useStore((s) => s.createItem)
  // 收據與行程照片在列表上是兩個不同的標記，所以分開統計。
  const photoMarks = useMemo(() => {
    const receipt = new Set<string>()
    const trip_ = new Set<string>()
    if (plan.kind !== 'actual') return { receipt, trip: trip_ }
    const mark = (kind: 'receipt' | 'trip', itemId: string) =>
      (kind === 'receipt' ? receipt : trip_).add(itemId)
    allPhotos
      .filter((photo) => !photo.deleted && photo.tripId === trip.id)
      .forEach((photo) => mark(photo.kind, photo.itemId))
    pendingPhotos
      .filter((photo) => photo.tripId === trip.id)
      .forEach((photo) => mark(photo.kind, photo.itemId))
    return { receipt, trip: trip_ }
  }, [allPhotos, pendingPhotos, plan.kind, trip.id])
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

      {copiedItem && (
        <div className="itinerary-copybar" role="status">
          <span>已複製「{copiedItem.title}」</span>
          <button className="btn btn-sm" onClick={onClearCopied}>清除</button>
        </div>
      )}

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
                    <span title="Google Maps 地點">
                      <MapPinIcon size={13} className="row-map-icon" />
                    </span>
                  )}
                  {item.links.some((link) => link.kind === 'web') && (
                    <span title="相關連結">
                      <LinkIcon size={13} className="row-link-icon" />
                    </span>
                  )}
                  {photoMarks.receipt.has(item.id) && (
                    <span title="有收據照片" aria-label="有收據照片">
                      <ReceiptIcon size={13} className="row-photo-icon" />
                    </span>
                  )}
                  {photoMarks.trip.has(item.id) && (
                    <span title="有行程照片" aria-label="有行程照片">
                      <PhotoIcon size={13} className="row-photo-icon" />
                    </span>
                  )}
                  {isUncategorized(item) && <span className="warn" style={{ marginLeft: 6 }}>缺類型</span>}
                  {item.notes
                    .filter((n) => n.showInOverview && n.text.trim())
                    .map((n) => (
                      <span key={n.id} className="overview-note">
                        {n.text.trim()}
                      </span>
                    ))}
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
              <div className="row itinerary-add-row">
                <button
                  className="dim itinerary-add-action"
                  onClick={() => {
                    setAddingOn(day)
                    setDraft({ startTime: '', title: '' })
                  }}
                >
                  <span className="dot" />
                  <span className="rowtime">＋</span>
                  <span>新增項目</span>
                </button>
                {copiedItem && (
                  <button
                    className="btn btn-sm itinerary-paste-action"
                    onClick={() => onPaste(day)}
                    title={`貼上「${copiedItem.title}」到 ${shortDate(day)}`}
                  >
                    貼上
                  </button>
                )}
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
