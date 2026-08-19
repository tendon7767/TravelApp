import { timeSortKey } from './date'
import type { Item } from '../types'

/** 建立與 store 脫鉤的行程快照，避免草稿或複製緩衝區共用巢狀物件。 */
export const copyItemSnapshot = (item?: Item): Item | undefined =>
  item
    ? {
        ...item,
        notes: item.notes.map((note) => ({ ...note })),
        links: item.links.map((link) => ({ ...link })),
        costs: item.costs.map((cost) => ({ ...cost })),
      }
    : undefined

/**
 * 「現在正在進行」的那一筆：最後一筆開始時間已經過去的項目。
 * 現在早於第一筆就取第一筆（清晨看行程時該指向今天的第一站）；
 * 沒填時間的是純支出、不佔時間軸，一律排除。
 * rows 必須已依 timeSortKey 排好（ItineraryTab 的 byDay 已保證）。
 */
export const pickCurrentItemId = (rows: Item[], minutes: number): string | undefined => {
  const timed = rows.filter((item) => item.startTime)
  if (!timed.length) return undefined
  let picked = timed[0]
  for (const item of timed) {
    if (timeSortKey(item.startTime) > minutes) break
    picked = item
  }
  return picked.id
}
