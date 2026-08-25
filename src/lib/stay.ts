import type { Item } from '../types'
import { addDays } from './date'

/**
 * 索引住宿時會一起同步的欄位。
 *
 * Google Map 連結與相關連結同住 `links` 陣列（靠 `kind` 分），所以是四樣不是五樣 ——
 * 不可能只同步地圖不同步相關連結，要拆得先把它們拆成兩個欄位。
 *
 * **費用刻意不在其中**：住宿費只該算一次，跟著同步的話支出總計與回饋額度都會 ×N。
 * 時間也不同步，每晚幾點回房本來就各自不同。
 * 心得與照片綁 itemId，天生就是各自的，連考慮都不必。
 */
export const MIRRORED_FIELDS = ['title', 'guide', 'notes', 'links'] as const

type MirroredPatch = Pick<Item, (typeof MIRRORED_FIELDS)[number]>

/** 從主筆取出要複製給從筆的那四樣。巢狀物件一律複製，兩筆不共用同一個參照。 */
export const mirrorPatch = (source: Item): MirroredPatch => ({
  title: source.title,
  guide: source.guide,
  notes: source.notes.map((note) => ({ ...note })),
  links: source.links.map((link) => ({ ...link })),
})

/** 這次的修改有沒有碰到同步欄位。沒碰到就不必驚動從筆。 */
export const touchesMirrored = (patch: Partial<Item>): boolean =>
  MIRRORED_FIELDS.some((field) => field in patch)

/** 索引自這一筆的從筆，依日期排好。 */
export const followersOf = (items: Item[], sourceId: string): Item[] =>
  items
    .filter((item) => item.sourceItemId === sourceId && !item.deleted)
    .sort((a, b) => a.date.localeCompare(b.date))

/**
 * 可以被這一筆索引的對象：同一個行程版本裡的住宿、還沒索引別人、也不是自己。
 * 從筆不列出來 —— 只准一層，索引一個索引會變成鏈。
 */
export const staySources = (items: Item[], me: Item): Item[] =>
  items
    .filter(
      (item) =>
        !item.deleted &&
        item.planId === me.planId &&
        item.id !== me.id &&
        item.category === '住宿' &&
        !item.sourceItemId,
    )
    .sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)))

/**
 * 入住日與退房日之間需要「還住在這裡」的日子。
 * 入住當天不算 —— 那是主筆自己那一筆；退房當天也不算，那天已經不住了。
 * 所以 8/25 入住、8/28 退房，回傳 8/26 與 8/27，連同主筆共三晚。
 */
export const nightsBetween = (checkIn: string, checkout: string): string[] => {
  const out: string[] = []
  if (!checkIn || !checkout) return out
  let cur = addDays(checkIn, 1)
  for (let guard = 0; cur < checkout && guard < 400; guard++) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/** 從筆的日期反推退房日：最後一晚的隔天。沒有從筆就沒有退房日可言。 */
export const checkoutOf = (items: Item[], sourceId: string): string | undefined => {
  const rows = followersOf(items, sourceId)
  return rows.length ? addDays(rows[rows.length - 1].date, 1) : undefined
}
