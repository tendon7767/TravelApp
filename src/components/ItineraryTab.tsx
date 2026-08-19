import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { ITINERARY_CATEGORIES, type ItineraryCategory, type Item, type Plan, type Trip } from '../types'
import { eachDay, nextSlotAfter, shortDate, timeSortKey } from '../lib/date'
import { useNowClock } from '../lib/useNowClock'
import { pickCurrentItemId } from '../lib/items'
import { flightStatusUrl, hasFlightStatus } from '../lib/flight'
import { applyCategoryTemplate, needsSecondLevel, quickItemsFor, soleQuickItem } from '../lib/presets'
import { formatMoney, formatTotals, isUncategorized, itemTotals, mergeTotals, toHome } from '../lib/money'
import CategoryIcon from './CategoryIcon'
import ClockIcon from './ClockIcon'
import MapPinIcon from './MapPinIcon'
import LinkIcon from './LinkIcon'
import PhotoIcon from './PhotoIcon'
import PlaneIcon from './PlaneIcon'
import ReceiptIcon from './ReceiptIcon'

/**
 * .itinerary-scroll 與它的祖先都是 position:static，section.offsetTop 是相對 body 量的，
 * 會多算導航列與日期橫條的高度。改用兩個 rect 相減，排版怎麼變都成立。
 */
const scrollToElement = (scroller: HTMLElement, el: HTMLElement, offset = 0) => {
  const top =
    scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset
  scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

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
  const { today, minutes: nowMin } = useNowClock()

  const days = useMemo(() => eachDay(trip.startDate, trip.endDate), [trip.startDate, trip.endDate])
  // 新增項目只走快選：先點類型，子項多於一個才展開第二層。
  const [addingOn, setAddingOn] = useState<string | null>(null)
  const [pickedCategory, setPickedCategory] = useState<ItineraryCategory | null>(null)
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

  // 今天不在旅程日期範圍內就沒有「現在」可言。
  const currentItemId = useMemo(
    () => (days.includes(today) ? pickCurrentItemId(byDay.get(today) ?? [], nowMin) : undefined),
    [byDay, days, today, nowMin],
  )

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
    // 用屬性找而不是 children[index]：前面多一顆 now 鈕時位置就全錯了。
    const pill = strip?.querySelector<HTMLElement>(`[data-day-pill="${activeDay}"]`)
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
    if (scroller && section) scrollToElement(scroller, section)
  }

  const scrollToCurrent = () => {
    const scroller = scrollRef.current
    const row = scroller?.querySelector<HTMLElement>(`[data-item-id="${currentItemId}"]`)
    if (!scroller || !row) return
    // sticky 的 .dayhead 會蓋住捲到頂端的那一列，讓開它實際量到的高度。
    const head = scroller.querySelector<HTMLElement>(`[data-day-section="${today}"] .dayhead`)
    programmaticDay.current = today
    setActiveDay(today)
    scrollToElement(scroller, row, head?.getBoundingClientRect().height ?? 0)
  }

  const beginManualScroll = () => {
    programmaticDay.current = undefined
  }

  const closeAdd = () => {
    setAddingOn(null)
    setPickedCategory(null)
  }

  const addQuick = (day: string, category: ItineraryCategory, title: string, time: string) => {
    const used = (byDay.get(day) ?? []).map((item) => item.startTime)
    // 固定時段被佔用時（第二頓晚餐、多段交通）就接在當天最後一筆之後，不疊在同一格。
    const startTime = time && !used.includes(time) ? time : nextSlotAfter(used)
    const { patch } = applyCategoryTemplate({ costs: [], notes: [] }, category, trip)
    createItem({ planId: plan.id, date: day, title, startTime, category, ...patch })
    setPickedCategory(null)
  }

  const pickCategory = (day: string, category: ItineraryCategory) => {
    if (needsSecondLevel(category)) {
      setPickedCategory(category)
      return
    }
    const quick = soleQuickItem(category)
    addQuick(day, category, quick.title, quick.time)
  }

  return (
    <div className="itinerary-view">
      <div className="daystrip" ref={daystripRef}>
        {days.map((day, i) => (
          <button
            key={day}
            className="daypill"
            data-day-pill={day}
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
              /* 航班連結要當這一列的子元素，<a> 不能巢狀在 <button> 裡，所以改用 role="button"。 */
              <div
                key={item.id}
                className="row"
                role="button"
                tabIndex={0}
                data-sel={item.id === selectedId}
                data-item-id={item.id}
                data-now={item.id === currentItemId}
                aria-current={item.id === currentItemId ? 'time' : undefined}
                onClick={() => onSelect(item.id)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  onSelect(item.id)
                }}
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
                {hasFlightStatus(item.title) && (
                  <a
                    className="row-flight"
                    href={flightStatusUrl(item.title)}
                    target="_blank"
                    rel="noreferrer"
                    title="查航班動態"
                    aria-label={`查「${item.title}」的航班動態`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PlaneIcon size={15} />
                  </a>
                )}
                <span className="rowmoney">{formatTotals(itemTotals(item))}</span>
              </div>
            ))}

            {addingOn === day ? (
              <div className="sec itinerary-quick">
                <div className="itinerary-quick-head">
                  <span className="label" style={{ margin: 0 }}>
                    {pickedCategory ? `${pickedCategory}：選一個` : '要加什麼？'}
                  </span>
                  {pickedCategory ? (
                    <button className="btn btn-sm" onClick={() => setPickedCategory(null)}>‹ 上一層</button>
                  ) : (
                    <button className="btn btn-sm" onClick={closeAdd} aria-label="關閉新增">✕</button>
                  )}
                </div>

                {pickedCategory ? (
                  <div className="quick-picker" role="group" aria-label={`${pickedCategory}項目`}>
                    {quickItemsFor(pickedCategory).map((quick) => (
                      <button
                        key={quick.title}
                        className="category-choice"
                        onClick={() => addQuick(day, pickedCategory, quick.title, quick.time)}
                      >
                        <CategoryIcon category={pickedCategory} size={18} />
                        <span>{quick.title}</span>
                        <span className="mono quick-time">{quick.time}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="quick-picker" role="group" aria-label="行程類型">
                    {ITINERARY_CATEGORIES.map((category) => (
                      <button
                        key={category}
                        className="category-choice"
                        onClick={() => pickCategory(day, category)}
                      >
                        <CategoryIcon category={category} size={18} />
                        <span>{category}</span>
                      </button>
                    ))}
                  </div>
                )}

                <p className="dim" style={{ fontSize: 11, margin: '2px 0 0' }}>
                  建好後點進去改名稱與時間。可以連續點，不會自動關閉。
                </p>
              </div>
            ) : (
              <div className="row itinerary-add-row">
                <button
                  className="dim itinerary-add-action"
                  onClick={() => {
                    setAddingOn(day)
                    setPickedCategory(null)
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

      {currentItemId && (
        <button
          className="now-fab"
          onClick={scrollToCurrent}
          title="回到現在的行程"
          aria-label="回到現在的行程"
        >
          <ClockIcon size={15} />now
        </button>
      )}
    </div>
  )
}
