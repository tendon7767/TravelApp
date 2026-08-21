/**
 * 橫條上「選中的那顆膠囊」的底色 —— 對話裡叫它膠囊底 —— 是獨立的一層
 * （.daypill[data-on]::before），可以先滑向下一顆，文字留在原地。
 * 這裡只管那一層要位移多少、要多寬。
 *
 * 寬度也要跟著漸變：膠囊的字數不一樣寬，只搬位移的話，落地那一刻會突然抽寬或縮窄。
 * 拖曳中底色會轉淡（CSS 靠 data-dragging 切），因為它會經過別顆膠囊的文字上面，
 * 實色會把字蓋到看不見。
 */

interface PillMetrics {
  /** 從這一顆到目的地那一顆的水平距離。沒有目的地（到頭到尾）就是 0。 */
  gap: number
  from: number
  to: number
}

export const pillMetrics = (
  strip: HTMLElement | null,
  from: number,
  to: number,
): PillMetrics | null => {
  const pills = strip?.querySelectorAll<HTMLElement>('[data-strip-pill]')
  const a = pills?.[from]
  if (!a) return null
  const b = pills?.[to]
  return {
    gap: b ? b.offsetLeft - a.offsetLeft : 0,
    from: a.offsetWidth,
    to: b ? b.offsetWidth : a.offsetWidth,
  }
}

export const setPillShift = (strip: HTMLElement | null, px: number) => {
  strip?.style.setProperty('--pill-shift', `${px}px`)
}

/** null 代表回到「跟著自己那顆膠囊」，也就是不再由這裡指定寬度。 */
export const setPillWidth = (strip: HTMLElement | null, px: number | null) => {
  strip?.style.setProperty('--pill-w', px === null ? '100%' : `${px}px`)
}

/** 拖曳中：底色轉淡、不要有轉場（有的話會跟不上手指）。 */
export const setDragging = (strip: HTMLElement | null, on: boolean) => {
  if (!strip) return
  if (on) strip.dataset.dragging = 'true'
  else delete strip.dataset.dragging
}

/** 放開：接下來這一小段位移與寬度變化要動畫。 */
export const setAnimating = (strip: HTMLElement | null, on: boolean) => {
  if (!strip) return
  if (on) strip.dataset.animating = 'true'
  else delete strip.dataset.animating
}

/** 收乾淨：位移、寬度、兩個旗標一起還原。換頁之後要在同一個 layout effect 裡做完。 */
export const resetPill = (strip: HTMLElement | null) => {
  setAnimating(strip, false)
  setDragging(strip, false)
  setPillShift(strip, 0)
  setPillWidth(strip, null)
}

/** 這一層的動畫長度，跟分頁滑動同一個值，兩者要一起落地。 */
export const SETTLE_MS = 180
