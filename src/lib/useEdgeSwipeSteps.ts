import { useCallback, useEffect, useRef, useState } from 'react'
import { DIRECTION_RATIO, LOCK_AT } from './useHorizontalSwipe'
import { EDGE_DAMPING } from './useSwipeSteps'

/*
 * 門檻比左右撥高一截，這三個數字是一組的。
 * 左右撥換日是一趟裡會做幾十次的事，門檻本來就該低；上下換行程是「這一則讀完了」，
 * 一趟十幾次，而且它的起手勢跟捲動完全重疊 —— 誤觸成本高、正常觸發頻率低。
 * 甩動那條尤其關鍵：捲到底之後順勢再滑一下，很容易就超過左右撥的 36px / 0.3，
 * 所以拉到「明確甩一段」才收。手感要微調就只動這三個數字。
 */
/** 拖過螢幕高度的三成才算換頁（812pt 的機器約 244px）。 */
const STEP_RATIO = 0.3
/** 甩得夠快也算，但要甩過這麼長（px），一般捲動收尾的順勢動作才不會中。 */
const FLING_MIN = 110
/** 甩動的速度門檻（px/ms）。 */
const FLING = 0.5

interface Options {
  canPrev: boolean
  canNext: boolean
  disabled?: boolean
  /**
   * 捲動層的選擇器（相對於掛手勢的那個元素，用 `:scope >` 限定直接子代）。
   * 手指落下的那一刻它必須已經在那個方向的盡頭，這一撥才算換頁。
   */
  scrollSelector: string
  /** 拖曳中。dy 往下為正，已經含到頭到尾的阻尼。 */
  onShift: (dy: number) => void
  /** 放開。step 是 -1（上一個）、0（沒換）、1（下一個）。 */
  onRelease: (step: -1 | 0 | 1) => void
}

/**
 * 捲到盡頭再拖一次，滑進上一筆／下一筆。
 * 方向判定與阻尼共用左右撥那一份（`useHorizontalSwipe` / `useSwipeSteps`），
 * 只有「拖多遠才算數」自己一組（見上面那三個常數）——
 * 那是這個手勢跟捲動重疊帶來的差異，不是兩套實作各自漂移。
 *
 * 跟橫向那支的結構差異還有兩處，都是垂直方向才有的問題：
 *   1. **盡頭只在 touchstart 判定。** 從中間一路捲到底、手不放就接著換頁的話，
 *      快速捲動的尾巴每次都會誤觸；放開再拖一次才算，就是「停在最底下再往下滑」。
 *   2. **鎖定後要 `preventDefault`**（所以是 `passive: false`）。垂直是瀏覽器自己的地盤，
 *      不擋的話它會在盡頭做橡皮筋，跟我們畫的位移疊在一起。
 */
export function useEdgeSwipeSteps<T extends HTMLElement>(options: Options) {
  const [el, setEl] = useState<T | null>(null)
  // 條件算繪的元素要用 callback ref：物件 ref 配 useEffect 的話效果跑的時候還是 null。
  const ref = useCallback((node: T | null) => setEl(node), [])
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    if (!el) return

    let startX = 0
    let startY = 0
    let startAt = 0
    /** null 表示還沒判定；'own' 這一撥歸我們，'no' 交還給捲動。 */
    let axis: 'own' | 'no' | null = null
    /** 鎖定時的方向，之後只認這一側，反手拖回去不會把鄰居換成另一個。 */
    let dir = 0
    let dragging = false
    let atTop = false
    let atBottom = false

    const onStart = (event: TouchEvent) => {
      axis = null
      dir = 0
      dragging = false
      if (latest.current.disabled || event.touches.length !== 1) return
      // 鍵盤升起代表正在打字，這時的拖曳是在選字。
      if (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb')) > 0) return
      const scroller = el.querySelector<HTMLElement>(latest.current.scrollSelector)
      if (!scroller) return
      atTop = scroller.scrollTop <= 0
      atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
      const touch = event.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      startAt = event.timeStamp
      dragging = true
    }

    const onMove = (event: TouchEvent) => {
      if (!dragging || axis === 'no' || event.touches.length !== 1) return
      const touch = event.touches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (axis === null) {
        if (Math.hypot(dx, dy) < LOCK_AT) return
        // 垂直要明顯多過水平，右滑關閉那一支才不會被搶走。
        const vertical = Math.abs(dy) > Math.abs(dx) * DIRECTION_RATIO
        axis = vertical && (dy > 0 ? atTop : atBottom) ? 'own' : 'no'
        if (axis === 'no') return
        dir = dy > 0 ? 1 : -1
      }
      if (event.cancelable) event.preventDefault()
      const moved = dir > 0 ? Math.max(0, dy) : Math.min(0, dy)
      const blocked = dir > 0 ? !latest.current.canPrev : !latest.current.canNext
      latest.current.onShift(blocked ? moved * EDGE_DAMPING : moved)
    }

    const onEnd = (event: TouchEvent) => {
      if (!dragging) return
      const own = axis === 'own'
      const side = dir
      dragging = false
      axis = null
      dir = 0
      if (!own) return
      const raw = event.changedTouches[0].clientY - startY
      const dy = side > 0 ? Math.max(0, raw) : Math.min(0, raw)
      const blocked = side > 0 ? !latest.current.canPrev : !latest.current.canNext
      const speed = dy / Math.max(1, event.timeStamp - startAt)
      const far = Math.abs(dy) > (el.offsetHeight || 1) * STEP_RATIO
      const flung = Math.abs(dy) > FLING_MIN && Math.abs(speed) > FLING
      latest.current.onRelease(blocked || !(far || flung) ? 0 : side > 0 ? -1 : 1)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
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
