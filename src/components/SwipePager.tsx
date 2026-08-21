import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useSwipeSteps } from '../lib/useSwipeSteps'
import {
  pillMetrics,
  resetPill,
  SETTLE_MS,
  setAnimating,
  setDragging,
  setPillShift,
  setPillWidth,
} from '../lib/stripIndicator'

interface Props {
  /** 橫條上的每一格，順序就是左右撥的順序。只有一格時橫條不出現。 */
  items: { key: string; label: string }[]
  index: number
  onIndex: (index: number) => void
  /** 第 i 格的內容。前後各多算繪一格，撥的時候才看得到下一格跟著進來。 */
  renderPane: (index: number) => ReactNode
}

/**
 * 上面一條膠囊橫條、下面一格一頁的左右撥切換。回饋頁（換持有人）與筆記頁（換筆記）共用。
 *
 * 拖曳中動的是內容與膠囊底，不是整個畫面 —— 整頁跟著手指跑的話，
 * 底下的導航列與頂列也會跟著位移，那不是「換一格」該有的樣子。
 * 膠囊底往目的地那一顆滑（跟手指反向），因為它指的是「要去哪」，
 * 跟內容同向的話放開時它得倒退跨回去，看起來像做錯了。
 *
 * 行程頁不用這個：那裡的「日」是同一條長捲動裡的位置而不是一頁。
 */
export default function SwipePager({ items, index, onIndex, renderPane }: Props) {
  const stripRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement | null>(null)
  const paneEls = useRef<(HTMLDivElement | null)[]>([])
  /** 每一格上次停在哪 —— 撥回來時要接回原來的位置，不是回到最上面。 */
  const scrollTops = useRef<Record<string, number>>({})

  const paintTrack = (dx: number, animate: boolean) => {
    const track = trackRef.current
    if (!track) return
    track.style.transition = animate ? `transform ${SETTLE_MS}ms ease-out` : ''
    track.style.transform = `translateX(calc(-33.3333% + ${dx}px))`
  }

  const setSwiping = (on: boolean) => {
    const view = viewRef.current
    if (!view) return
    if (on) view.dataset.swiping = 'true'
    else delete view.dataset.swiping
  }

  const swipeRef = useSwipeSteps<HTMLDivElement>({
    canPrev: index > 0,
    canNext: index < items.length - 1,
    ignoreWithin: '.daystrip',
    onShift: ({ dx, progress }) => {
      const strip = stripRef.current
      setSwiping(true)
      setDragging(strip, true)
      setAnimating(strip, false)
      paintTrack(dx, false)
      const m = pillMetrics(strip, index, dx < 0 ? index + 1 : index - 1)
      if (!m) return
      setPillShift(strip, m.gap * progress)
      setPillWidth(strip, m.from + (m.to - m.from) * progress)
    },
    onRelease: (step) => {
      const strip = stripRef.current
      const width = trackRef.current ? trackRef.current.offsetWidth / 3 : 0
      setAnimating(strip, true)
      paintTrack(step * -width, true)
      const m = pillMetrics(strip, index, index + step)
      if (m) {
        setPillShift(strip, step ? m.gap : 0)
        setPillWidth(strip, step ? m.to : null)
      }
      window.setTimeout(() => {
        if (!step) {
          setSwiping(false)
          paintTrack(0, false)
          resetPill(strip)
          return
        }
        /*
         * 只換頁，位移留著不要清。清完再交給 React 的話，中間會繪出一幀
         * 「軌道已經歸位、內容還是舊的」—— 收尾統一在下面的 layout effect 做，
         * 那裡保證跑在瀏覽器繪之前。
         */
        onIndex(index + step)
      }, SETTLE_MS)
    },
  })

  const setView = useCallback(
    (node: HTMLDivElement | null) => {
      viewRef.current = node
      swipeRef(node)
    },
    [swipeRef],
  )

  /*
   * 換頁之後的收尾。用 layout effect 而不是動畫結束的 setTimeout：
   * DOM 更新完、瀏覽器繪之前跑，所以看不到中間狀態。
   */
  useLayoutEffect(() => {
    const track = trackRef.current
    if (track) {
      track.style.transition = ''
      track.style.transform = ''
    }
    setSwiping(false)
    resetPill(stripRef.current)
    // 三格各自接回自己上次停留的位置，包含還在旁邊等著被撥進來的那兩格。
    paneEls.current.forEach((el, slot) => {
      if (!el) return
      const key = items[index + slot - 1]?.key
      el.scrollTop = key ? (scrollTops.current[key] ?? 0) : 0
    })
  }, [index, items])

  // 切到畫面外的那一格時，橫條要把它帶回中間。比照日期橫條的做法。
  useLayoutEffect(() => {
    const strip = stripRef.current
    const pill = strip?.querySelectorAll<HTMLElement>('[data-strip-pill]')[index]
    if (!strip || !pill) return
    strip.scrollTo({
      left: pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2,
      behavior: 'smooth',
    })
  }, [index])

  const paneProps = (slot: number) => ({
    ref: (el: HTMLDivElement | null) => {
      paneEls.current[slot] = el
    },
    className: 'pager-pane',
    onScroll: (event: { currentTarget: HTMLDivElement }) => {
      const key = items[index + slot - 1]?.key
      if (key) scrollTops.current[key] = event.currentTarget.scrollTop
    },
  })

  return (
    <>
      {items.length > 1 && (
        <div className="daystrip" ref={stripRef}>
          {items.map((item, i) => (
            <button
              key={item.key}
              className="daypill"
              data-strip-pill=""
              data-on={i === index}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => onIndex(i)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="pager-view" ref={setView}>
        <div className="pager-track" ref={trackRef}>
          <div {...paneProps(0)}>{index > 0 && renderPane(index - 1)}</div>
          <div {...paneProps(1)}>{renderPane(index)}</div>
          <div {...paneProps(2)}>{index < items.length - 1 && renderPane(index + 1)}</div>
        </div>
      </div>
    </>
  )
}
