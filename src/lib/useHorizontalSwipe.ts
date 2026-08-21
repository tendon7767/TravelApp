import { useCallback, useEffect, useRef, useState } from 'react'

/** 從畫面最左緣起算，這段寬度讓給 iOS 自己的歷史返回手勢。 */
export const EDGE_GUARD = 24
/** 位移超過這麼多才判定方向，避免點擊時的微小抖動被當成拖曳。 */
export const LOCK_AT = 8
/** 水平要明顯多過垂直才算橫向，不然捲動列表時會誤判。 */
export const DIRECTION_RATIO = 1.5
/** 甩得夠快就算數（px/ms），但仍要拖過一段距離，免得手指一抖就觸發。 */
export const FLING = 0.3
export const FLING_MIN = 36

interface Options {
  /** 'right' 只認往右拖（關閉這一層），'both' 兩邊都認（切換上下一個）。 */
  direction: 'right' | 'both'
  /** 鍵盤升起、桌機側欄版面等等不該吃手勢的情況。 */
  disabled?: boolean
  /** 起點落在這些選擇器裡就放行，例如本來就要橫捲的日期列。 */
  ignoreWithin?: string
  /** 連 touchstart 一起吃掉，外層的同類手勢就完全不會開始。 */
  stopPropagation?: boolean
  /** 判定成橫向拖曳的那一刻。 */
  onLock?: (el: HTMLElement) => void
  /** 拖曳中，dx 是從起點算的位移。 */
  onMove: (dx: number, el: HTMLElement) => void
  /** 放開或取消。speed 是 px/ms，正負跟 dx 同向。 */
  onEnd: (info: { dx: number; speed: number; el: HTMLElement }) => void
}

/**
 * 橫向拖曳的共同底層：判方向、擋掉不該吃的情況、算速度。
 * 「拖到哪要做什麼」交給呼叫端 —— 關閉這一層（useSwipeBack）與
 * 切換上下一個（useSwipeSteps）差別只在那裡，門檻與判定必須是同一份，
 * 兩邊各寫一套遲早會漂移成兩種手感。
 *
 * 不需要 preventDefault：所有捲動層都設了 touch-action: pan-y，
 * 瀏覽器只接管垂直方向，水平的 touchmove 本來就完整送到這裡。
 */
export function useHorizontalSwipe<T extends HTMLElement>(options: Options) {
  /*
   * 回傳的是 callback ref 而不是物件 ref：要掛手勢的元素常常是條件算繪的
   * （詳細頁就是），用 useEffect 搭物件 ref 的話，效果跑的時候 current 還是 null，
   * 之後元素出現也不會再跑一次，手勢就永遠掛不上。
   */
  const [el, setEl] = useState<T | null>(null)
  const ref = useCallback((node: T | null) => setEl(node), [])
  // 事件監聽只掛一次，但回呼每次算繪都是新的，所以放進 ref 讓監聽讀得到最新值。
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    if (!el) return

    let startX = 0
    let startY = 0
    let startAt = 0
    /** null 表示還沒判定方向；'v' 表示這一次交給捲動，不再理會。 */
    let axis: 'h' | 'v' | null = null
    let dragging = false

    const onStart = (event: TouchEvent) => {
      const { disabled: off, ignoreWithin: skip } = latest.current
      axis = null
      dragging = false
      if (off || event.touches.length !== 1) return
      const touch = event.touches[0]
      // 最左緣讓給系統的返回手勢。這個 App 的網址參數都用 replace 寫入，
      // 歷史不累積，系統手勢會直接離開整個旅程頁而不是關掉這一層。
      if (touch.clientX < EDGE_GUARD) return
      if (skip && event.target instanceof Element && event.target.closest(skip)) return
      // 鍵盤升起代表正在打字，這時的水平拖曳是在選字，不該被當成手勢。
      if (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb')) > 0) return
      if (latest.current.stopPropagation) event.stopPropagation()
      startX = touch.clientX
      startY = touch.clientY
      startAt = event.timeStamp
      dragging = true
    }

    const onMove = (event: TouchEvent) => {
      if (!dragging || axis === 'v' || event.touches.length !== 1) return
      const touch = event.touches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (axis === null) {
        if (Math.hypot(dx, dy) < LOCK_AT) return
        const horizontal =
          Math.abs(dx) > Math.abs(dy) * DIRECTION_RATIO &&
          (latest.current.direction === 'both' || dx > 0)
        axis = horizontal ? 'h' : 'v'
        if (axis === 'v') return
        latest.current.onLock?.(el)
      }
      latest.current.onMove(dx, el)
    }

    const onEnd = (event: TouchEvent) => {
      if (!dragging) return
      const wasHorizontal = axis === 'h'
      dragging = false
      axis = null
      if (!wasHorizontal) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - startX
      latest.current.onEnd({
        dx,
        speed: dx / Math.max(1, event.timeStamp - startAt),
        el,
      })
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [el])

  return ref
}
