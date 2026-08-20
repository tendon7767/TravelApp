import { useCallback, useEffect, useRef, useState } from 'react'

/** 從畫面最左緣起算，這段寬度讓給 iOS 自己的歷史返回手勢。 */
const EDGE_GUARD = 24
/** 位移超過這麼多才判定方向，避免點擊時的微小抖動被當成拖曳。 */
const LOCK_AT = 8
/** 水平要明顯多過垂直才算橫向，不然捲動列表時會誤判。 */
const DIRECTION_RATIO = 1.5
/** 放開時拖過螢幕的幾成就算完成。 */
const COMPLETE_RATIO = 1 / 3
/** 或者甩得夠快也算（px/ms），但仍要拖過這段距離，免得手指一抖就關掉。 */
const FLING = 0.5
const FLING_MIN = 60

interface Options {
  /**
   * 手勢完成時要做的事。
   * 傳進來的通常是會攔未儲存修改的那個版本，不要直接關。
   */
  onDismiss: () => void
  /** 鍵盤升起、桌機側欄版面等等不該吃手勢的情況。 */
  disabled?: boolean
  /** 起點落在這些選擇器裡就放行，例如本來就要橫捲的日期列。 */
  ignoreWithin?: string
  /** 連 touchstart 一起吃掉，外層的同類手勢就完全不會開始。 */
  stopPropagation?: boolean
}

/**
 * 往右拖曳關閉目前這一層。跟著手指走，放開時超過門檻才真的關，不到就彈回。
 *
 * 不需要 preventDefault：所有捲動層都設了 touch-action: pan-y，
 * 瀏覽器只接管垂直方向，水平的 touchmove 本來就完整送到這裡。
 */
export function useSwipeBack<T extends HTMLElement>({
  onDismiss,
  disabled = false,
  ignoreWithin,
  stopPropagation = false,
}: Options) {
  /*
   * 回傳的是 callback ref 而不是物件 ref：要掛手勢的元素常常是條件算繪的
   * （詳細頁就是），用 useEffect 搭物件 ref 的話，效果跑的時候 current 還是 null，
   * 之後元素出現也不會再跑一次，手勢就永遠掛不上。
   */
  const [el, setEl] = useState<T | null>(null)
  const ref = useCallback((node: T | null) => setEl(node), [])
  // 事件監聽只掛一次，但回呼每次算繪都是新的，所以放進 ref 讓監聽讀得到最新值。
  const latest = useRef({ onDismiss, disabled, ignoreWithin, stopPropagation })
  latest.current = { onDismiss, disabled, ignoreWithin, stopPropagation }

  useEffect(() => {
    if (!el) return

    let startX = 0
    let startY = 0
    let startAt = 0
    /** null 表示還沒判定方向；'v' 表示這一次交給捲動，不再理會。 */
    let axis: 'h' | 'v' | null = null
    let dragging = false

    const paint = (dx: number) => {
      el.style.transform = dx ? `translateX(${dx}px)` : ''
    }

    const release = (animate: boolean) => {
      el.style.transition = animate ? 'transform 0.18s ease-out' : ''
      paint(0)
      if (animate) window.setTimeout(() => { el.style.transition = '' }, 200)
    }

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
      // 鍵盤升起代表正在打字，這時的水平拖曳是在選字，不該被當成關閉手勢。
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
        axis = dx > 0 && Math.abs(dx) > Math.abs(dy) * DIRECTION_RATIO ? 'h' : 'v'
        if (axis === 'v') return
      }
      paint(Math.max(0, dx))
    }

    const onEnd = (event: TouchEvent) => {
      if (!dragging) return
      const wasHorizontal = axis === 'h'
      dragging = false
      axis = null
      if (!wasHorizontal) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - startX
      const speed = dx / Math.max(1, event.timeStamp - startAt)
      if (dx > el.offsetWidth * COMPLETE_RATIO || (dx > FLING_MIN && speed > FLING)) {
        // 先滑出去再交棒，不然畫面會在原地瞬間消失。
        el.style.transition = 'transform 0.16s ease-out'
        paint(el.offsetWidth)
        window.setTimeout(() => {
          release(false)
          latest.current.onDismiss()
        }, 160)
        return
      }
      release(true)
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
