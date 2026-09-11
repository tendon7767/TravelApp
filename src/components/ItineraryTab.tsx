import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { ITINERARY_CATEGORIES, type ItineraryCategory, type Item, type Plan, type Trip } from '../types'
import { eachDay, shortDate, timeSortKey } from '../lib/date'
import { useDayScroller } from '../lib/useDayScroller'
import { useDaySwipe } from '../lib/useDaySwipe'
import { useNowClock } from '../lib/useNowClock'
import { pickCurrentItemId } from '../lib/items'
import { applyTemplate, needsSecondLevel, quickItemsFor, soleQuickItem, type QuickItem } from '../lib/presets'
import { formatMoney, formatTotals, isUncategorized, itemTotals, mergeTotals, toHome } from '../lib/money'
import CategoryIcon from './CategoryIcon'
import ClockIcon from './ClockIcon'
import DayStrip from './DayStrip'
import MapPinIcon from './MapPinIcon'
import LinkIcon from './LinkIcon'
import PhotoIcon from './PhotoIcon'
import CloseIcon from './CloseIcon'

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

const mapLinkOf = (item: Item) => item.links.find((link) => link.kind === 'map')

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
  const hideItemMoney = useStore((s) => Boolean(s.settings.hideItemMoney))
  const toggleItemMoney = useStore((s) => s.toggleItemMoney)
  /*
   * 哪幾筆有行程照片。收據照片那個標記跟著詳細頁的區塊一起收起來了 ——
   * 標記指著一個點進去看不到的東西，比沒有標記更讓人困惑。
   */
  const photoMarks = useMemo(() => {
    const marked = new Set<string>()
    if (plan.kind !== 'actual') return marked
    allPhotos
      .filter((photo) => !photo.deleted && photo.tripId === trip.id && photo.kind === 'trip')
      .forEach((photo) => marked.add(photo.itemId))
    pendingPhotos
      .filter((photo) => photo.tripId === trip.id && photo.kind === 'trip')
      .forEach((photo) => marked.add(photo.itemId))
    return marked
  }, [allPhotos, pendingPhotos, plan.kind, trip.id])
  const { today, minutes: nowMin } = useNowClock()

  const days = useMemo(() => eachDay(trip.startDate, trip.endDate), [trip.startDate, trip.endDate])
  // 新增項目只走快選：先點類型，子項多於一個才展開第二層。
  const [addingOn, setAddingOn] = useState<string | null>(null)
  const [pickedCategory, setPickedCategory] = useState<ItineraryCategory | null>(null)
  const { activeDay, scrollRef, daystripRef, scrollProps, jumpTo, holdDay, scrollToNow } =
    useDayScroller(days, today)
  const stepDays = useDaySwipe<HTMLDivElement>({
    days,
    activeDay,
    stripRef: daystripRef,
    jumpTo,
    holdDay,
  })

  /*
   * 詳細頁上下滑到別的日子時，背後的列表要跟著換日 ——
   * 不然關掉詳細頁會發現列表還停在舊的那一天。從搜尋或回饋頁點進另一天的那一筆也一樣。
   * **只在「選中的那一筆換了」時跳一次**：桌機是左右並排，列表捲得動，
   * 每次 activeDay 一飄就跳回去的話，那條列表等於被釘住捲不動。
   */
  const selectedDate = items.find((item) => item.id === selectedId)?.date
  const jumpedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedId) {
      jumpedFor.current = null
      return
    }
    if (selectedId === jumpedFor.current) return
    jumpedFor.current = selectedId
    if (selectedDate && selectedDate !== activeDay) jumpTo(selectedDate)
  }, [selectedId, selectedDate, activeDay, jumpTo])

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

  const closeAdd = () => {
    setAddingOn(null)
    setPickedCategory(null)
  }

  const [freshId, setFreshId] = useState<string>()
  useEffect(() => {
    if (!freshId) return
    const timer = setTimeout(() => setFreshId(undefined), 2600)
    return () => clearTimeout(timer)
  }, [freshId])

  /**
   * 剛建好的那一筆。收起選單之後畫面會往回跳，總得讓人看得出來東西加到哪去了；
   * 幾秒後自己消失，不需要使用者去關掉它。
   */
  const addQuick = (day: string, category: ItineraryCategory, quick: QuickItem) => {
    // 時間照模板給的，不管當天有沒有別的項目佔用 —— 同一時段本來就可能有兩筆。
    // 費用與備註取自該子項自己的預設值，飛機和地鐵本來就不該長一樣。
    const { patch } = applyTemplate(
      { costs: [], costGroups: [], notes: [], guide: '' },
      quick.preset,
      trip,
    )
    const created = createItem({
      planId: plan.id,
      date: day,
      title: quick.title,
      startTime: quick.time || undefined,
      category,
      ...patch,
    })
    // 建好就收起來。以前是留著讓人連續點，但實際上多數時候是加一筆就要去改它，
    // 開著的選單反而擋住剛建好的那一列。要再加一筆按一次「＋」就好，位置不會跑。
    closeAdd()
    setFreshId(created.id)
  }

  const pickCategory = (day: string, category: ItineraryCategory) => {
    if (needsSecondLevel(category)) {
      setPickedCategory(category)
      return
    }
    addQuick(day, category, soleQuickItem(category))
  }

  return (
    <div className="itinerary-view" ref={stepDays}>
      <DayStrip days={days} activeDay={activeDay} today={today} stripRef={daystripRef} onPick={jumpTo} />

      {copiedItem && (
        <div className="itinerary-copybar" role="status">
          <span>已複製「{copiedItem.title}」</span>
          <button className="btn btn-sm" onClick={onClearCopied}>清除</button>
        </div>
      )}

      <div ref={scrollRef} className="itinerary-scroll" {...scrollProps}>
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
              {/* 當日總計同時是「每筆金額顯示與否」的開關，全趟一起切換：
                  平常只看總計就夠，要追細項再打開。 */}
              <button
                type="button"
                className="mono dim dayhead-total"
                aria-pressed={!hideItemMoney}
                title={hideItemMoney ? '顯示每筆金額' : '收起每筆金額'}
                onClick={toggleItemMoney}
              >
                {formatTotals(totals) || '—'}
              </button>
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
                data-fresh={item.id === freshId || undefined}
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
                  {!hideItemMoney && item.links.some((link) => link.kind === 'map') && (
                    <span title="Google Maps 地點">
                      <MapPinIcon size={13} className="row-map-icon" />
                    </span>
                  )}
                  {item.links.some((link) => link.kind === 'web') && (
                    <span title="相關連結">
                      <LinkIcon size={13} className="row-link-icon" />
                    </span>
                  )}
                  {photoMarks.has(item.id) && (
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
                {hideItemMoney ? (
                  mapLinkOf(item) && (
                    /* 收起金額才出現：標題後那顆 pin 只是指示器，這裡是一點就導航。
                       巢在 role="button" 裡，要擋冒泡才不會連詳細頁一起開。 */
                    <a
                      className="row-action"
                      href={mapLinkOf(item)!.url}
                      target="_blank"
                      rel="noreferrer"
                      title="開啟 Google Maps"
                      aria-label={`在 Google Maps 開啟「${item.title}」`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MapPinIcon size={15} />
                    </a>
                  )
                ) : (
                  <span className="rowmoney">{formatTotals(itemTotals(item))}</span>
                )}
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
                    <button
                      className="btn btn-sm btn-glyph btn-plain"
                      onClick={closeAdd}
                      aria-label="關閉新增"
                    >
                      <CloseIcon size={20} />
                    </button>
                  )}
                </div>

                {pickedCategory ? (
                  <div className="quick-picker" role="group" aria-label={`${pickedCategory}項目`}>
                    {quickItemsFor(pickedCategory).map((quick) => (
                      <button
                        key={quick.title}
                        className="category-choice"
                        onClick={() => addQuick(day, pickedCategory, quick)}
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
                  建好後點進去改名稱與時間。
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

      {/* 今天在範圍內就給按鈕。沒有「正在進行」的那一筆時捲到今天那一段，
          不是把按鈕收掉 —— 今天沒行程、或行程都沒填時間都會落到這條。 */}
      {days.includes(today) && (
        <button
          className="now-fab"
          onClick={() => scrollToNow(today, currentItemId)}
          title="回到現在的行程"
          aria-label="回到現在的行程"
        >
          <ClockIcon size={15} />now
        </button>
      )}
    </div>
  )
}
