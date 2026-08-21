import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useStore } from '../store/useStore'
import type { Item, Plan, Review, Trip } from '../types'
import { eachDay, shortDate, timeSortKey } from '../lib/date'
import { useDayScroller } from '../lib/useDayScroller'
import { useDaySwipe } from '../lib/useDaySwipe'
import { useNowClock } from '../lib/useNowClock'
import { pickCurrentItemId } from '../lib/items'
import { clearReviewDrafts, loadReviewDrafts, saveReviewDrafts } from '../store/drafts'
import { tagCharOf } from '../lib/reviewHues'
import CategoryIcon from './CategoryIcon'
import ClockIcon from './ClockIcon'
import DayStrip from './DayStrip'
import Modal from './Modal'
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

/** 要放棄修改的那一則。心得是一則一則編的，沒有「整批取消」這回事。 */
type CancelTarget = { itemId: string }

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

  const { activeDay, scrollRef, daystripRef, scrollProps, jumpTo, holdDay, scrollToNow } =
    useDayScroller(days, today)
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
  /* 跟行程列表同一套左右撥換日；編輯中不吃，那時的橫向拖曳多半是在選字。 */
  const stepDays = useDaySwipe<HTMLDivElement>({
    days,
    activeDay,
    stripRef: daystripRef,
    jumpTo,
    holdDay,
    disabled: hasEditing,
  })

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

  /**
   * 切換編輯狀態前，那一列在畫面上的位置。
   * 泡泡換成輸入框（或換回來）會讓整條捲動的內容變高變矮 —— 捲在底部附近時
   * `scrollTop` 會被夾住，整個畫面當場往上跳一大段。記著那一列原本在哪，
   * 切換後把捲動位置補回去，視線就留在原地。
   */
  const anchorRef = useRef<{ itemId: string; top: number } | null>(null)
  const anchorRow = (itemId: string) => {
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-item-id="${itemId}"]`)
    anchorRef.current = row ? { itemId, top: row.getBoundingClientRect().top } : null
  }

  /* 收尾寫在 layout effect：它保證跑在瀏覽器繪之前，不會先繪出跳掉的那一幀。 */
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const scroller = scrollRef.current
    if (!anchor || !scroller) return
    anchorRef.current = null
    const row = scroller.querySelector<HTMLElement>(`[data-item-id="${anchor.itemId}"]`)
    if (!row) return
    scroller.scrollTop += row.getBoundingClientRect().top - anchor.top
    /*
     * 捲在底部附近時補不回來：內容變矮，scrollTop 已經被夾在新的最大值上。
     * 在尾端補上剛好差額的空白，讓它捲得回去 —— 這是唯一能把那一列釘回原處的辦法，
     * 空白只在最底下、只在編輯期間存在，編輯結束就收掉。
     */
    const rest = row.getBoundingClientRect().top - anchor.top
    if (rest <= 1) return
    scroller.style.paddingBottom = `${parseFloat(scroller.style.paddingBottom || '0') + rest}px`
    scroller.scrollTop += rest
  }, [drafts, scrollRef])

  /* 尾端那段補償只在編輯期間存在。 */
  useEffect(() => {
    if (hasEditing) return
    const scroller = scrollRef.current
    if (scroller) scroller.style.paddingBottom = ''
  }, [hasEditing, scrollRef])

  /*
   * 進編輯時把游標放進那一則。不能用 autoFocus：瀏覽器為了讓焦點元素露出來，
   * 會去捲「每一個」可捲的祖先 —— html / body / #root 雖然都是 overflow: hidden，
   * 那只是不給使用者捲，程式與焦點照樣捲得動，整個 App 會被推上去、底下露出背景。
   * 改成 preventScroll，再自己把該捲的那一條捲到剛好看得見就好。
   */
  /**
   * 把正在編輯的那一組（輸入框連同它底下的取消／儲存）帶進可視範圍。
   * 對象是整組不是輸入框 —— 鍵盤升起時看得到自己在打什麼還不夠，
   * 那兩顆按鈕也要看得到，不然又回到「要送出得先捲畫面」。
   * 捲的只有 .itinerary-scroll 這一條，捲最小的距離。
   */
  const revealEditing = useCallback(() => {
    const scroller = scrollRef.current
    const active = document.activeElement
    if (!scroller || !(active instanceof HTMLTextAreaElement)) return
    const group = active.closest<HTMLElement>('.detail-review-edit')
    if (!group) return
    const box = scroller.getBoundingClientRect()
    const rect = group.getBoundingClientRect()
    const margin = 8
    if (rect.bottom > box.bottom - margin) scroller.scrollTop += rect.bottom - box.bottom + margin
    else if (rect.top < box.top + margin) scroller.scrollTop -= box.top - rect.top + margin
  }, [scrollRef])

  useEffect(() => {
    if (!focusId) return
    const scroller = scrollRef.current
    const el = scroller?.querySelector<HTMLTextAreaElement>(`[data-review-edit="${focusId}"]`)
    setFocusId(null)
    if (!scroller || !el) return
    el.focus({ preventScroll: true })
    revealEditing()
  }, [focusId, scrollRef, revealEditing])

  /*
   * 鍵盤是動畫升起的，focus 當下量到的可視範圍還是沒鍵盤時的。
   * 可視視窗一縮就再帶一次；350ms 是等它停穩，跟 keyboard.ts 用的是同一個數字。
   */
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(revealEditing, 350)
    }
    vv.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      vv.removeEventListener('resize', onResize)
    }
  }, [revealEditing])

  const beginEdit = (itemId: string) => {
    if (itemId in drafts) return
    anchorRow(itemId)
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
    anchorRow(itemId)
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
      requestRowCancel(itemId)
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

  /**
   * 只寫這一則就收起來。心得是一則一則寫的 —— 底部那排「一次存全部」的按鈕
   * 逼著使用者把它捲出來，而且它管的東西跟當下在打的那一則根本不是同一件事。
   */
  const saveRow = (itemId: string) => {
    anchorRow(itemId)
    if (drafts[itemId] !== mineText(itemId)) setReview(itemId, drafts[itemId])
    setDrafts((current) => {
      const next = { ...current }
      delete next[itemId]
      return next
    })
    setFocusId((current) => (current === itemId ? null : current))
    setCancelTarget(null)
  }

  /** 動過的先問一次再丟。點列取消與那顆取消鍵走同一段。 */
  const requestRowCancel = (itemId: string) => {
    if (drafts[itemId] !== mineText(itemId)) setCancelTarget({ itemId })
    else discardRow(itemId)
  }

  return (
    <div className="itinerary-view review-view" ref={stepDays}>
      {cancelTarget && (
        <Modal
          title="尚未儲存變更"
          onCancel={() => setCancelTarget(null)}
          onComplete={() => discardRow(cancelTarget.itemId)}
          cancelLabel="繼續編輯"
          completeLabel="放棄變更"
          completeDanger
        >
          <p style={{ margin: 0 }}>
            確定要放棄這則心得的修改嗎？其他正在編輯的不受影響。
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
                          /* 編輯時照樣掛名牌，樣子還是一顆氣泡 —— 只是底色淺一階、多一圈框，
                             一眼看得出「這則正在改」，而不是換成一個跟四周無關的表單欄位。 */
                          <div
                            className="detail-review detail-review-edit review-hue"
                            data-hue={hues?.[me]}
                          >
                            <span className="review-tag" title={me}>
                              {tagCharOf(me)}
                            </span>
                            <div className="review-edit">
                              {/* rows={1}：textarea 預設兩行高，而 autoGrow 量的 scrollHeight
                                  至少等於當下的框高 —— 不寫死一行，空的心得就從兩行開始。 */}
                              <textarea
                                className="review-edit-box"
                                ref={autoGrow}
                                data-review-edit={item.id}
                                rows={1}
                                placeholder="實際去了之後的感想"
                                value={drafts[item.id]}
                                onInput={(event) => autoGrow(event.currentTarget)}
                                onChange={(event) =>
                                  setDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                                }
                              />
                              {/* 按鈕就在剛打完字的手指旁邊，不必為了送出去捲畫面。 */}
                              <div className="review-edit-actions">
                                <button
                                  className="btn btn-sm"
                                  onClick={() => requestRowCancel(item.id)}
                                >
                                  取消
                                </button>
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => saveRow(item.id)}
                                  disabled={drafts[item.id] === mine}
                                >
                                  儲存
                                </button>
                              </div>
                            </div>
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

      {/* 編輯中就收掉：那個當下你在寫字，不是在導航。 */}
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
    </div>
  )
}
