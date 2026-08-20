import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useStore } from '../store/useStore'
import type { Item, Plan, Review, Trip } from '../types'
import { eachDay, shortDate, timeSortKey } from '../lib/date'
import { useDayScroller } from '../lib/useDayScroller'
import { useNowClock } from '../lib/useNowClock'
import { clearReviewDrafts, loadReviewDrafts, saveReviewDrafts } from '../store/drafts'
import CategoryIcon from './CategoryIcon'
import DayStrip from './DayStrip'
import Modal from './Modal'
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

/**
 * 心得模式：整趟的心得攤在同一頁，由上而下讀得完，要補寫就在原地展開輸入框。
 *
 * 點擊語意刻意只有兩種，而且不重疊：**列＝開合、心得區＝編輯**。
 * 收合時不留任何心得預覽 —— 只有一行的心得，收合與展開會長得一模一樣，
 * 但同一行字一個是展開、一個是進編輯，怎麼標示都救不回來。
 * 開合狀態改由列尾的箭頭表達，收合而裡面有東西的再補一個泡泡圖示。
 *
 * 編輯沿用詳細行程的「改完按儲存」：可以同時開好幾則，最後按一次完成一起寫入。
 */
export default function ReviewTab({ trip, plan, onDirtyChange }: Props) {
  const allItems = useStore((s) => s.data.items)
  const allReviews = useStore((s) => s.data.reviews)
  const setReview = useStore((s) => s.setReview)
  const me = useStore((s) => s.settings.memberName)
  const { today } = useNowClock()

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

  const { activeDay, scrollRef, daystripRef, scrollProps, jumpTo } = useDayScroller(days, today)
  // 只有正在編輯的那幾則會進 drafts；沒動過的不佔位子，dirty 才好算。
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [focusId, setFocusId] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
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

  const editProps = (itemId: string) => {
    if (itemId in drafts) return {}
    return {
      role: 'button' as const,
      'aria-label': '編輯心得',
      tabIndex: 0,
      onClick: () => beginEdit(itemId),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        beginEdit(itemId)
      },
    }
  }

  const toggleItem = (itemId: string) => {
    // 編輯中的不給收，草稿被藏起來會以為自己打的東西不見了。
    if (itemId in drafts) return
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
    const ids = (byDay.get(day) ?? []).map((item) => item.id).filter((id) => !(id in drafts))
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
    setConfirmingCancel(false)
    void clearReviewDrafts(plan.id)
  }

  const completeEditing = () => {
    editingIds.forEach((id) => {
      if (drafts[id] !== mineText(id)) setReview(id, drafts[id])
    })
    stopEditing()
  }

  const requestCancel = () => {
    if (dirty) setConfirmingCancel(true)
    else stopEditing()
  }

  return (
    <div className="itinerary-view">
      {confirmingCancel && (
        <Modal
          title="尚未儲存變更"
          onCancel={() => setConfirmingCancel(false)}
          onComplete={stopEditing}
          cancelLabel="繼續編輯"
          completeLabel="放棄變更"
          completeDanger
        >
          <p style={{ margin: '12px 0 0' }}>確定要取消編輯並放棄這次的全部修改嗎？</p>
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
                const expanded = editing || !collapsed.has(item.id)
                const others = othersOf(item.id)
                const mine = mineText(item.id)
                const hasContent = Boolean(mine.trim()) || others.length > 0
                return (
                  <div key={item.id} className="review-entry">
                    <div
                      className="row review-row"
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() => toggleItem(item.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        toggleItem(item.id)
                      }}
                    >
                      <CategoryIcon category={item.category} className="row-category-icon" />
                      <span className="rowtime">{item.startTime ?? ''}</span>
                      <span className="rowtitle">{item.title}</span>
                      {!expanded && hasContent && (
                        <span title="收起來了，裡面有心得" aria-label="有心得">
                          <ReviewIcon size={13} className="row-photo-icon" />
                        </span>
                      )}
                      <span className="review-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                    </div>

                    {expanded && (
                      <div
                        className={`review-body${editing ? '' : ' detail-section-clickable'}`}
                        {...editProps(item.id)}
                      >
                        {others.map((review) => (
                          <div key={review.id} className="detail-review">
                            <p>
                              <span className="detail-key">{review.author}：</span>
                              {review.text}
                            </p>
                          </div>
                        ))}
                        {editing ? (
                          <div className="detail-review">
                            <span className="detail-key">{me}：</span>
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
                          /* 還沒寫過的就是同一個氣泡、名字後面沒字，不另做一種空狀態的樣子。 */
                          <div className="detail-review">
                            <p>
                              <span className="detail-key">{me}：</span>
                              {mine}
                            </p>
                          </div>
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

      {hasEditing && (
        <div className="editor-actions">
          <button className="btn" onClick={requestCancel}>取消編輯</button>
          <button className="btn btn-primary" onClick={completeEditing} disabled={!dirty}>
            完成編輯
          </button>
        </div>
      )}
    </div>
  )
}
