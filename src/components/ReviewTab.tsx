import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useStore } from '../store/useStore'
import type { Item, Plan, Review, Trip } from '../types'
import { eachDay, shortDate, timeSortKey } from '../lib/date'
import { useDayScroller } from '../lib/useDayScroller'
import { useNowClock } from '../lib/useNowClock'
import { pickCurrentItemId } from '../lib/items'
import { clearReviewDrafts, loadReviewDrafts, saveReviewDrafts } from '../store/drafts'
import { tagCharOf } from '../lib/reviewHues'
import CategoryIcon from './CategoryIcon'
import ClockIcon from './ClockIcon'
import DayStrip from './DayStrip'
import Modal from './Modal'
import EditActions from './EditActions'
import PencilIcon from './PencilIcon'
import ReviewIcon from './ReviewIcon'

interface Props {
  trip: Trip
  plan: Plan
  onDirtyChange: (dirty: boolean) => void
}

/**
 * 輸入框跟著內容長高。心得長短差很多，寫死 rows 的話短的浪費半個畫面、
 * 長的要在小框裡捲，兩邊都難讀。上限交給 CSS 的 max-height 收。
 * 掛在 ref 上負責掛載時（含還原草稿）的初始高度，onInput 負責打字途中。
 */
const autoGrow = (el: HTMLTextAreaElement | null) => {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

/** 取消編輯的對象：底部那顆是整批，點列則只丟棄那一列。 */
type CancelTarget = { kind: 'all' } | { kind: 'row'; itemId: string }

/**
 * 心得模式：整趟的心得攤在同一頁，由上而下讀得完，要補寫就在原地展開輸入框。
 *
 * 點行程列的意思固定是「處理這則的心得」，實際做什麼看它的狀態：
 * 編輯中就取消該列編輯、有東西可讀就開合、什麼都沒有就直接進編輯。
 * 沒東西可讀的那則不存在「展開」狀態，所以也不需要開合箭頭 ——
 * 列尾的泡泡（有東西可讀）與鉛筆（你還沒寫）已經把會發生什麼講完了。
 *
 * 編輯沿用詳細行程的「改完按儲存」：可以同時開好幾則，最後按一次完成一起寫入。
 */
export default function ReviewTab({ trip, plan, onDirtyChange }: Props) {
  const allItems = useStore((s) => s.data.items)
  const allReviews = useStore((s) => s.data.reviews)
  const setReview = useStore((s) => s.setReview)
  const me = useStore((s) => s.settings.memberName)
  // 沒指定的作者一律中性色，交給 CSS 的預設值處理，這裡就不給 data-hue。
  const hues = useStore((s) => s.settings.reviewHues?.[trip.id])
  const { today, minutes: nowMin } = useNowClock()

  const items = useMemo(
    () => allItems.filter((i) => i.planId === plan.id && !i.deleted),
    [allItems, plan.id],
  )
  const days = useMemo(() => eachDay(trip.startDate, trip.endDate), [trip.startDate, trip.endDate])
  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const day of days) map.set(day, [])
    for (const item of items) map.get(item.date)?.push(item)
    for (const rows of map.values()) {
      rows.sort((a, b) => timeSortKey(a.startTime) - timeSortKey(b.startTime))
    }
    return map
  }, [days, items])

  const byItem = useMemo(() => {
    const map = new Map<string, Review[]>()
    for (const review of allReviews) {
      if (review.deleted) continue
      map.set(review.itemId, [...(map.get(review.itemId) ?? []), review])
    }
    return map
  }, [allReviews])

  const mineText = (itemId: string) =>
    byItem.get(itemId)?.find((review) => review.author === me)?.text ?? ''
  const othersOf = (itemId: string) =>
    (byItem.get(itemId) ?? []).filter((review) => review.author !== me && review.text.trim())
  /** 有沒有東西可讀，是列尾圖示與點列行為的唯一判準。 */
  const hasContentOf = (itemId: string) =>
    Boolean(mineText(itemId).trim()) || othersOf(itemId).length > 0

  const { activeDay, scrollRef, daystripRef, scrollProps, jumpTo, scrollToNow } = useDayScroller(days, today)
  const currentItemId = useMemo(
    () => (days.includes(today) ? pickCurrentItemId(byDay.get(today) ?? [], nowMin) : undefined),
    [byDay, days, today, nowMin],
  )
  // 只有正在編輯的那幾則會進 drafts；沒動過的不佔位子，dirty 才好算。
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [focusId, setFocusId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const editingIds = Object.keys(drafts)
  const hasEditing = editingIds.length > 0
  const dirty = editingIds.some((id) => drafts[id] !== mineText(id))

  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  /*
   * 行程列要釘在日期橫條下方，就得知道那條有多高 —— 而它會隨字型與縮放變動，
   * 所以照 TripPage 量 --topbar-h 的做法量出來，不在 CSS 裡寫死數字。
   */
  useEffect(() => {
    const head = scrollRef.current?.querySelector<HTMLElement>('.dayhead')
    if (!head) return
    const sync = () =>
      document.documentElement.style.setProperty('--dayhead-h', `${head.offsetHeight}px`)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(head)
    return () => ro.disconnect()
  }, [scrollRef, days.length])

  /*
   * 作者名牌要釘在自己那則行程列的正下方，所以還得知道那一列多高。
   * 列高不一致（標題會換行），只好各量各的 —— 但一個 ResizeObserver 可以掛
   * 多個目標，不是每列一個觀察器，所以這件事很便宜。
   */
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const write = (row: HTMLElement) =>
      row.parentElement?.style.setProperty('--reviewrow-h', `${row.offsetHeight}px`)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) write(entry.target as HTMLElement)
    })
    scroller.querySelectorAll<HTMLElement>('.review-row').forEach((row) => {
      // 先同步寫一次再交給觀察器：ResizeObserver 的回呼掛在算繪步驟上，
      // 分頁在背景時不會送達，只靠它的話初值永遠是 fallback。
      write(row)
      ro.observe(row)
    })
    return () => ro.disconnect()
  }, [scrollRef, items])

  useEffect(() => {
    let cancelled = false
    void loadReviewDrafts(plan.id).then((saved) => {
      if (cancelled) return
      if (saved) setDrafts(saved.texts)
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [plan.id])

  useEffect(() => {
    if (!hydrated) return
    if (dirty) saveReviewDrafts(plan.id, drafts)
    else void clearReviewDrafts(plan.id)
  }, [hydrated, dirty, drafts, plan.id])

  const beginEdit = (itemId: string) => {
    if (itemId in drafts) return
    setFocusId(itemId)
    setDrafts((current) => ({ ...current, [itemId]: mineText(itemId) }))
  }

  /**
   * 只掛在自己那則氣泡上。別人的氣泡純閱讀 ——
   * 點別人寫的東西卻跳出自己的輸入框，怎麼想都是意外而不是意圖。
   */
  const editProps = (itemId: string) => {
    if (itemId in drafts) return {}
    return {
      role: 'button' as const,
      'aria-label': '編輯我的心得',
      tabIndex: 0,
      onClick: () => beginEdit(itemId),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        beginEdit(itemId)
      },
    }
  }

  /** 丟棄單獨一列的草稿，其他列正在編輯的內容不受影響。 */
  const discardRow = (itemId: string) => {
    setDrafts((current) => {
      const next = { ...current }
      delete next[itemId]
      return next
    })
    setFocusId((current) => (current === itemId ? null : current))
    setCancelTarget(null)
  }

  /**
   * 點行程列的意思固定是「處理這則的心得」，做什麼由它現在的狀態決定。
   * 收合永遠不會把編輯中的草稿藏起來 —— 編輯中的那列，點列是取消編輯，
   * 動過的會先問一次。
   */
  const openRow = (itemId: string, hasContent: boolean) => {
    if (itemId in drafts) {
      if (drafts[itemId] !== mineText(itemId)) setCancelTarget({ kind: 'row', itemId })
      else discardRow(itemId)
      return
    }
    // 沒東西可讀就沒有「展開」這個狀態可言，直接進編輯，中間不經過一個空框。
    if (!hasContent) {
      beginEdit(itemId)
      return
    }
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(itemId)) next.add(itemId)
      return next
    })
  }

  /**
   * 日期橫條收的是「整天的心得」，行程列本身留著。
   * 收合狀態只存 collapsed 這一份，整天開合就是批次改它的成員，不另開一組狀態。
   */
  const toggleDay = (day: string) => {
    // 沒東西可讀的那些本來就沒有收合狀態，不列入判斷也不動它們。
    const ids = (byDay.get(day) ?? [])
      .filter((item) => !(item.id in drafts) && hasContentOf(item.id))
      .map((item) => item.id)
    if (!ids.length) return
    const allCollapsed = ids.every((id) => collapsed.has(id))
    setCollapsed((current) => {
      const next = new Set(current)
      ids.forEach((id) => (allCollapsed ? next.delete(id) : next.add(id)))
      return next
    })
  }

  const stopEditing = () => {
    setDrafts({})
    setFocusId(null)
    setCancelTarget(null)
    void clearReviewDrafts(plan.id)
  }

  const completeEditing = () => {
    editingIds.forEach((id) => {
      if (drafts[id] !== mineText(id)) setReview(id, drafts[id])
    })
    stopEditing()
  }

  const requestCancel = () => {
    if (dirty) setCancelTarget({ kind: 'all' })
    else stopEditing()
  }

  return (
    <div className="itinerary-view review-view">
      {cancelTarget && (
        <Modal
          title="尚未儲存變更"
          onCancel={() => setCancelTarget(null)}
          onComplete={() =>
            cancelTarget.kind === 'all' ? stopEditing() : discardRow(cancelTarget.itemId)
          }
          cancelLabel="繼續編輯"
          completeLabel="放棄變更"
          completeDanger
        >
          <p style={{ margin: '12px 0 0' }}>
            {cancelTarget.kind === 'all'
              ? '確定要取消編輯並放棄這次的全部修改嗎？'
              : '確定要放棄這則心得的修改嗎？其他正在編輯的不受影響。'}
          </p>
        </Modal>
      )}

      <DayStrip days={days} activeDay={activeDay} today={today} stripRef={daystripRef} onPick={jumpTo} />

      <div ref={scrollRef} className="itinerary-scroll" {...scrollProps}>
        {days.map((day, i) => {
          const rows = byDay.get(day) ?? []
          return (
            <section key={day} id={`day-${day}`} data-day-section={day}>
              <div
                className="dayhead review-dayhead"
                role="button"
                tabIndex={0}
                aria-label={`收合或展開 ${shortDate(day)} 的心得`}
                onClick={() => toggleDay(day)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  toggleDay(day)
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  Day {i + 1} · {shortDate(day)}
                  {day === today && <span className="chip chip-accent" style={{ marginLeft: 6 }}>今天</span>}
                </span>
              </div>

              {rows.length === 0 && <p className="dim review-blank">這天沒有行程</p>}

              {rows.map((item) => {
                const editing = item.id in drafts
                const others = othersOf(item.id)
                const mine = mineText(item.id)
                const hasContent = Boolean(mine.trim()) || others.length > 0
                // 沒東西可讀的那則不存在「展開」狀態，所以進來的第一眼就是
                // 有心得的都攤開、沒心得的各佔一行。
                const expanded = editing || (hasContent && !collapsed.has(item.id))
                return (
                  <div key={item.id} className="review-entry">
                    <div
                      className="row review-row"
                      role="button"
                      tabIndex={0}
                      data-item-id={item.id}
                      data-now={item.id === currentItemId}
                      aria-expanded={editing || !hasContent ? undefined : expanded}
                      aria-label={
                        editing
                          ? `取消編輯「${item.title}」的心得`
                          : hasContent
                            ? undefined
                            : `寫「${item.title}」的心得`
                      }
                      onClick={() => openRow(item.id, hasContent)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        openRow(item.id, hasContent)
                      }}
                    >
                      <CategoryIcon category={item.category} className="row-category-icon" />
                      <span className="rowtime">{item.startTime ?? ''}</span>
                      <span className="rowtitle">{item.title}</span>
                      {/* 展開時內容就在眼前，這個標記只在收合時才有資訊量。 */}
                      {!expanded && hasContent && (
                        <span title="有心得" aria-label="有心得">
                          <ReviewIcon size={13} className="row-photo-icon" />
                        </span>
                      )}
                      {/*
                       * 筆是獨立按鈕，按它一定是寫自己的心得，不受該列展開與否影響 ——
                       * 別人寫了而我沒寫的那則，點列只會展開，這裡才是補寫的直接入口。
                       * <button> 巢在 role="button" 裡要擋冒泡，跟 .row-action 同一招。
                       */}
                      {!mine.trim() && !editing && (
                        <button
                          className="review-write-hint"
                          title="新增心得"
                          aria-label={`寫「${item.title}」的心得`}
                          onClick={(event) => {
                            event.stopPropagation()
                            beginEdit(item.id)
                          }}
                        >
                          <PencilIcon size={15} />
                        </button>
                      )}
                    </div>

                    {expanded && (
                      <div className="review-body">
                        {others.map((review) => (
                          <div
                            key={review.id}
                            className="detail-review review-hue"
                            data-hue={hues?.[review.author]}
                          >
                            <span className="review-tag" title={review.author}>
                              {tagCharOf(review.author)}
                            </span>
                            <p>{review.text}</p>
                          </div>
                        ))}
                        {editing ? (
                          /* 編輯時不掛名牌，改用等寬的縮排讓輸入框跟上面的氣泡對齊。 */
                          <div className="detail-review detail-review-edit">
                            <textarea
                              className="field"
                              ref={autoGrow}
                              placeholder="實際去了之後的感想"
                              value={drafts[item.id]}
                              autoFocus={focusId === item.id}
                              onInput={(event) => autoGrow(event.currentTarget)}
                              onChange={(event) =>
                                setDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                              }
                            />
                          </div>
                        ) : (
                          /* 還沒寫的不畫任何東西 —— 空框沒有資訊量，列尾那支筆已經講完了。 */
                          mine.trim() && (
                            <div
                              className="detail-review review-hue detail-section-clickable"
                              data-hue={hues?.[me]}
                              {...editProps(item.id)}
                            >
                              <span className="review-tag" title={me}>
                                {tagCharOf(me)}
                              </span>
                              <p>{mine}</p>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>

      {/*
        * 編輯中就收掉：fab 固定在導航列上方 30px，正好是按鈕列的位置，兩者會疊在一起。
        * 而且那個當下你在寫字，不是在導航。
        */}
      {days.includes(today) && !hasEditing && (
        <button
          className="now-fab"
          onClick={() => scrollToNow(today, currentItemId)}
          title="回到現在的行程"
          aria-label="回到現在的行程"
        >
          <ClockIcon size={15} />now
        </button>
      )}

      {hasEditing && (
        <EditActions dirty={dirty} onCancel={requestCancel} onComplete={completeEditing} />
      )}
    </div>
  )
}
