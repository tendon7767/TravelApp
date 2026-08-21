/**
 * 橫條上「選中的那顆膠囊」的底色是獨立的一層（.daypill[data-on]::before），
 * 可以先滑向下一顆，文字留在原地。這裡只管那一層要位移多少。
 *
 * 拖曳中底色會變成淡的（CSS 靠 data-dragging 切），因為它會經過別顆膠囊的文字上面，
 * 實色會把字蓋到看不見。
 */

/** 從第 from 顆膠囊到第 to 顆之間的距離，量不到就回 0（沒有橫條時不動就好）。 */
export const pillGap = (strip: HTMLElement | null, from: number, to: number) => {
  const pills = strip?.querySelectorAll<HTMLElement>('[data-strip-pill]')
  const a = pills?.[from]
  const b = pills?.[to]
  if (!a || !b) return 0
  return b.offsetLeft - a.offsetLeft
}

export const setPillShift = (strip: HTMLElement | null, px: number) => {
  strip?.style.setProperty('--pill-shift', `${px}px`)
}

/** 拖曳中：底色轉淡、不要有轉場（有的話會跟不上手指）。 */
export const setDragging = (strip: HTMLElement | null, on: boolean) => {
  if (!strip) return
  if (on) strip.dataset.dragging = 'true'
  else delete strip.dataset.dragging
}

/** 放開：接下來這一小段位移要動畫。 */
export const setAnimating = (strip: HTMLElement | null, on: boolean) => {
  if (!strip) return
  if (on) strip.dataset.animating = 'true'
  else delete strip.dataset.animating
}

/** 這一層的動畫長度，跟分頁滑動同一個值，兩者要一起落地。 */
export const SETTLE_MS = 180
