import { FLING, FLING_MIN, useHorizontalSwipe } from './useHorizontalSwipe'

/** 切換用的門檻比關閉那個小：走到下一天是常做的事，不該每次都拖過四分之一個螢幕。 */
export const STEP_RATIO = 0.18
/** 已經到頭或到尾時只讓它動一點點，手感上就知道再拖也沒有了。 */
export const EDGE_DAMPING = 0.25

interface Options {
  canPrev: boolean
  canNext: boolean
  disabled?: boolean
  /** 起點落在這些選擇器裡就放行，例如本來就要橫捲的日期列。 */
  ignoreWithin?: string
  /**
   * 拖曳中。dx 是原始位移（往右為正），progress 是它佔一次切換的比例（0～1），
   * blocked 表示那個方向已經沒有下一個了。畫什麼由呼叫端決定 ——
   * 行程頁只動膠囊的底色，回饋與筆記還要把內容一起帶走。
   */
  onShift: (info: { dx: number; progress: number; blocked: boolean; width: number }) => void
  /** 放開。step 是 -1（上一個）、0（沒換）、1（下一個）。 */
  onRelease: (step: -1 | 0 | 1) => void
}

/**
 * 左右撥切換序列裡的上一個／下一個：行程頁換日、回饋頁換持有人、筆記頁換筆記。
 * 手勢判定與門檻共用 useHorizontalSwipe，這裡只負責把位移換算成「換或不換」。
 */
export function useSwipeSteps<T extends HTMLElement>({
  canPrev,
  canNext,
  disabled = false,
  ignoreWithin,
  onShift,
  onRelease,
}: Options) {
  return useHorizontalSwipe<T>({
    direction: 'both',
    disabled,
    ignoreWithin,
    onMove: (dx, el) => {
      const blocked = dx > 0 ? !canPrev : !canNext
      const width = el.offsetWidth || 1
      const moved = blocked ? dx * EDGE_DAMPING : dx
      onShift({ dx: moved, progress: Math.min(Math.abs(moved) / width, 1), blocked, width })
    },
    onEnd: ({ dx, speed, el }) => {
      const blocked = dx > 0 ? !canPrev : !canNext
      const far = Math.abs(dx) > (el.offsetWidth || 1) * STEP_RATIO
      const flung = Math.abs(dx) > FLING_MIN && Math.abs(speed) > FLING
      if (blocked || !(far || flung)) return onRelease(0)
      onRelease(dx > 0 ? -1 : 1)
    },
  })
}
