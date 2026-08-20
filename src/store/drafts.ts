import { del, get, set } from 'idb-keyval'
import type { Item } from '../types'

export type ItemDraftSection = 'basic' | 'guide' | 'map' | 'notes' | 'links' | 'costs' | 'review'

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
  /** 詳細資訊改成分區編輯後，要知道重新開啟時該還原哪一區。 */
  section?: ItemDraftSection
  /** 新版允許同時編輯多個區塊；section 留給舊草稿相容。 */
  sections?: ItemDraftSection[]
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

/**
 * 心得模式是一次編輯多則，所以整批存成一筆，key 掛在版本上。
 * 不共用上面那組 API：它的 debounce 只有一個 timer，同時編輯多則會互相取消，
 * 最後只有一則寫得進去。丟草稿的理由與上面相同，而批次編輯丟掉的量更大。
 */
export interface ReviewDrafts {
  /** itemId → 尚未按下「完成編輯」的心得內容。 */
  texts: Record<string, string>
  savedAt: number
}

const reviewKey = (planId: string) => `travelapp:draft:reviews:${planId}`

let reviewTimer: ReturnType<typeof setTimeout> | undefined

export const saveReviewDrafts = (planId: string, texts: Record<string, string>) => {
  clearTimeout(reviewTimer)
  reviewTimer = setTimeout(() => {
    void set(reviewKey(planId), { texts, savedAt: Date.now() } satisfies ReviewDrafts)
  }, 400)
}

export const loadReviewDrafts = (planId: string): Promise<ReviewDrafts | undefined> =>
  get<ReviewDrafts>(reviewKey(planId))

export const clearReviewDrafts = (planId: string): Promise<void> => {
  clearTimeout(reviewTimer)
  return del(reviewKey(planId))
}
