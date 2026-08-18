const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

/**
 * 試算表若把日期/時間自動轉成 Date，舊後端會送回完整 ISO timestamp。
 * 轉回裝置本地的原始日期與時間，讓 Safari 的 date/time input 也能接受。
 */
export const normalizeStoredDate = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (!value.includes('T')) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : toISO(date)
}

export const normalizeStoredTime = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const plain = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (plain) return `${plain[1].padStart(2, '0')}:${plain[2]}`
  if (!value.includes('T')) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** 一律以本地時間解讀 YYYY-MM-DD，避免 new Date('2026-10-31') 被當成 UTC 而位移一天。 */
export const parseDate = (iso: string): Date => {
  const [y, m, d] = normalizeStoredDate(iso).split('-').map(Number)
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

/** 快速新增用的 30 分鐘刻度，對應你試算表裡那份 0:00–23:30 的下拉清單。 */
export const HALF_HOUR_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  return `${String(h).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
})

/** 接受 9:10、0910、09:10，統一成 HH:mm；無法解讀就回 undefined。 */
export const normalizeTime = (raw: string): string | undefined => {
  const v = raw.trim()
  if (!v) return undefined
  const m = v.match(/^(\d{1,2})[:.]?(\d{2})$/)
  if (!m) return undefined
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return undefined
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** 時間排序用；沒填時間的排最後，因為那是純支出、不佔時間軸位置。 */
export const timeSortKey = (t?: string): number => {
  if (!t) return 24 * 60 + 1
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
