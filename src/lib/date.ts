const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

/** 一律以本地時間解讀 YYYY-MM-DD，避免 new Date('2026-10-31') 被當成 UTC 而位移一天。 */
export const parseDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const addDays = (iso: string, n: number): string => {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** 起訖日之間的每一天（含頭含尾）。 */
export const eachDay = (start: string, end: string): string[] => {
  const out: string[] = []
  if (!start || !end) return out
  let cur = start
  for (let guard = 0; cur <= end && guard < 400; guard++) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

export const dayCount = (start: string, end: string): number => eachDay(start, end).length

/** 10/31 週六 */
export const shortDate = (iso: string): string => {
  const d = parseDate(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAYS[d.getDay()]}`
}

export const todayISO = (): string => toISO(new Date())

/** 時間排序用；沒填時間的排最後，因為那是純支出、不佔時間軸位置。 */
export const timeSortKey = (t?: string): number => {
  if (!t) return 24 * 60 + 1
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
