import { del, get, set } from 'idb-keyval'
import type { Item } from '../types'

/**
 * 未送出的編輯內容存進 IndexedDB。
 * 草稿原本只活在 React 狀態裡，桌機有 beforeunload 攔得住，
 * 但 iOS Safari 與加到主畫面的 PWA 被切到背景後可能直接被系統回收，
 * 不會有任何提示 —— 在飛機上打了一大段遊玩說明，切出去再回來就沒了。
 */
export interface ItemDraft {
  item: Item
  timeDraft: string
  reviewDraft: string
  savedAt: number
}

const key = (itemId: string) => `travelapp:draft:item:${itemId}`

let timer: ReturnType<typeof setTimeout> | undefined

/** 打字途中頻繁寫入沒有意義，停手一下再存。 */
export const saveItemDraft = (itemId: string, draft: Omit<ItemDraft, 'savedAt'>) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    void set(key(itemId), { ...draft, savedAt: Date.now() })
  }, 400)
}

export const loadItemDraft = (itemId: string): Promise<ItemDraft | undefined> =>
  get<ItemDraft>(key(itemId))

export const clearItemDraft = (itemId: string): Promise<void> => {
  clearTimeout(timer)
  return del(key(itemId))
}
