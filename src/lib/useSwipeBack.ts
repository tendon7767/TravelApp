import {
  FLING,
  FLING_MIN,
  useHorizontalSwipe,
} from './useHorizontalSwipe'

/** 放開時拖過螢幕的幾成就算完成。 */
const COMPLETE_RATIO = 0.25

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
  /** 判定成橫向拖曳時通知，讓呼叫端可以先在底下墊出下一層的畫面。 */
  onDrag?: (active: boolean) => void
}

/**
 * 往右拖曳關閉目前這一層。跟著手指走，放開時超過門檻才真的關，不到就彈回。
 * 方向判定與門檻在 useHorizontalSwipe，跟切換上下一個的手勢共用同一份。
 */
export function useSwipeBack<T extends HTMLElement>({
  onDismiss,
  disabled = false,
  ignoreWithin,
  stopPropagation = false,
  onDrag,
}: Options) {
  const paint = (el: HTMLElement, dx: number) => {
    el.style.transform = dx ? `translateX(${dx}px)` : ''
  }

  const release = (el: HTMLElement, animate: boolean) => {
    el.style.transition = animate ? 'transform 0.18s ease-out' : ''
    paint(el, 0)
    if (animate) window.setTimeout(() => { el.style.transition = '' }, 200)
  }

  return useHorizontalSwipe<T>({
    direction: 'right',
    disabled,
    ignoreWithin,
    stopPropagation,
    onLock: () => onDrag?.(true),
    onMove: (dx, el) => paint(el, Math.max(0, dx)),
    onEnd: ({ dx, speed, el }) => {
      const done = () => onDrag?.(false)
      if (dx > el.offsetWidth * COMPLETE_RATIO || (dx > FLING_MIN && speed > FLING)) {
        // 先滑出去再交棒，不然畫面會在原地瞬間消失。
        el.style.transition = 'transform 0.16s ease-out'
        paint(el, el.offsetWidth)
        window.setTimeout(() => {
          /*
           * 位移留著不要清。先清成 0 再交棒的話，元素會在原位閃現一幀才被卸載，
           * 看起來就是關閉瞬間閃出另一個畫面。
           */
          onDismiss()
          // 沒真的關掉（例如被未儲存的確認彈窗攔下）就滑回原位。
          window.requestAnimationFrame(() => {
            if (!el.isConnected) return done()
            release(el, true)
            window.setTimeout(done, 200)
          })
        }, 160)
        return
      }
      release(el, true)
      window.setTimeout(done, 200)
    },
  })
}
