import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useSwipeSteps } from './useSwipeSteps'
import {
  pillMetrics,
  resetPill,
  SETTLE_MS,
  setAnimating,
  setDragging,
  setPillShift,
  setPillWidth,
} from './stripIndicator'

interface Options {
  days: string[]
  activeDay: string
  stripRef: RefObject<HTMLDivElement | null>
  jumpTo: (day: string) => void
  /** useDayScroller 的鎖：判定成橫向拖曳時要把它補回去。 */
  holdDay: () => void
  disabled?: boolean
}

/**
 * 行程列表與心得模式的左右撥換日。兩邊共用，那段對時序很敏感，複製一份必然走樣。
 *
 * 拖曳中只有膠囊底跟著滑，內容不動 —— 這一頁的「日」是同一條長捲動裡的位置，
 * 把整頁拖走等於騙人。
 *
 * 放開就立刻捲，不等膠囊底的動畫：換日之後 `data-on` 已經在新的那顆上，
 * 於是先把膠囊底倒推回手指離開的位置（FLIP），下一幀再讓它滑回家。
 * 反過來做（先等動畫、再換日）就是那 180ms 的延遲，而且那段時間裡再撥一下，
 * 算出來的目的地會是還沒更新的舊日期。
 */
export function useDaySwipe<T extends HTMLElement>({
  days,
  activeDay,
  stripRef,
  jumpTo,
  holdDay,
  disabled = false,
}: Options) {
  const index = days.indexOf(activeDay)
  /** 手指離開時膠囊底看起來在哪（相對於當時那顆膠囊）。 */
  const drag = useRef<{ shift: number; width: number } | null>(null)
  /** 換日後要倒推回去的量，交給下面的 layout effect 用掉。 */
  const flip = useRef<{ shift: number; width: number } | null>(null)
  const settle = useRef<number | undefined>(undefined)

  const ref = useSwipeSteps<T>({
    canPrev: index > 0,
    canNext: index >= 0 && index < days.length - 1,
    disabled,
    ignoreWithin: '.daystrip',
    onShift: ({ dx, progress }) => {
      // 這一下的 touchstart 已經把捲動追蹤解鎖了，確定是橫向就補回去，
      // 否則前一次還在跑的平滑捲動會在拖曳途中把 activeDay 一路改掉。
      holdDay()
      const strip = stripRef.current
      setDragging(strip, true)
      setAnimating(strip, false)
      const m = pillMetrics(strip, index, dx < 0 ? index + 1 : index - 1)
      if (!m) return
      const shift = m.gap * progress
      const width = m.from + (m.to - m.from) * progress
      setPillShift(strip, shift)
      setPillWidth(strip, width)
      drag.current = { shift, width }
    },
    onRelease: (step) => {
      const strip = stripRef.current
      const from = drag.current
      drag.current = null
      if (!step) {
        setAnimating(strip, true)
        setPillShift(strip, 0)
        setPillWidth(strip, null)
        window.clearTimeout(settle.current)
        settle.current = window.setTimeout(() => resetPill(strip), SETTLE_MS)
        return
      }
      const m = pillMetrics(strip, index, index + step)
      flip.current = m
        ? { shift: (from?.shift ?? 0) - m.gap, width: from?.width ?? m.from }
        : null
      jumpTo(days[index + step])
    },
  })

  useLayoutEffect(() => {
    const strip = stripRef.current
    const from = flip.current
    flip.current = null
    window.clearTimeout(settle.current)
    if (!from) {
      resetPill(strip)
      return
    }
    // 倒推回手指離開的位置，這一步不能有轉場；下一幀才滑回家。
    setDragging(strip, true)
    setAnimating(strip, false)
    setPillShift(strip, from.shift)
    setPillWidth(strip, from.width)
    const raf = window.requestAnimationFrame(() => {
      setAnimating(strip, true)
      setPillShift(strip, 0)
      setPillWidth(strip, null)
      settle.current = window.setTimeout(() => resetPill(strip), SETTLE_MS)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [activeDay, stripRef])

  return ref
}
