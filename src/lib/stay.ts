import type { Item } from '../types'
import { addDays, timeSortKey } from './date'

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

/** 索引自這一筆的從筆，依日期排好。含手動挑來源的那種，不是只有連住的晚。 */
export const followersOf = (items: Item[], sourceId: string): Item[] =>
  items
    .filter((item) => item.sourceItemId === sourceId && !item.deleted)
    .sort((a, b) => a.date.localeCompare(b.date))

/**
 * 連住排出來的那幾晚。
 * **同步不等於連住** —— 入住、退房那種手動挑來源的從筆只是共用內容，
 * 不算一晚，也不歸 `setStayCheckout` 管，所以晚數與退房日只能數這一份。
 */
export const stayNightsOf = (items: Item[], sourceId: string): Item[] =>
  followersOf(items, sourceId).filter((item) => item.stayNight)

/**
 * 這一筆該不該顯示「前往住宿」，以及要跳去哪一筆。
 *
 * 規則**只看當天**，完全不讀 `sourceItemId`：同一天有兩筆以上的住宿時，
 * 除了最後一筆以外，其餘每一筆都指向最後一筆 —— 那是當天「回房睡覺」那一筆，
 * 飯店資訊與住宿費都放在它身上。同一天只有一筆就沒有連結可言。
 *
 * 不依賴主從關係是刻意的：主筆的日期可以改、同行者的舊版還建得出同天從筆，
 * 「主從必然跨日」不是保證得了的性質。只看當天就怎麼亂都炸不了，
 * 最壞情況是指到一份一模一樣的內容，無害。
 *
 * 「最後一筆」用 `timeSortKey` 排，沒填時間的排最後。**兩筆都沒填時間時順序不穩定**
 * （同步合併回來 items 的順序會變，而 sort 是穩定的），那是刻意留著的提醒：
 * 該給其中一筆填時間了。它純粹是衍生的顯示，不寫進資料，翻面也弄不髒任何東西。
 */
export const stayJumpTarget = (items: Item[], me: Item): Item | undefined => {
  if (me.category !== '住宿') return undefined
  const sameDay = items
    .filter(
      (item) =>
        !item.deleted &&
        item.planId === me.planId &&
        item.date === me.date &&
        item.category === '住宿',
    )
    .sort((a, b) => timeSortKey(a.startTime) - timeSortKey(b.startTime))
  if (sameDay.length < 2) return undefined
  const last = sameDay[sameDay.length - 1]
  return last.id === me.id ? undefined : last
}

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

/** 連住的日期反推退房日：最後一晚的隔天。沒有連住就沒有退房日可言。 */
export const checkoutOf = (items: Item[], sourceId: string): string | undefined => {
  const rows = stayNightsOf(items, sourceId)
  return rows.length ? addDays(rows[rows.length - 1].date, 1) : undefined
}
