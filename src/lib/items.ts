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
