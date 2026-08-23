import { del, get, set } from 'idb-keyval'
import type { Item } from '../types'

export type ItemDraftSection = 'basic' | 'guide' | 'notes' | 'links' | 'costs' | 'review'
export type ItemDraftMode = 'section' | 'all'

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
  /** 單獨改一區與整頁批次編輯有不同的提交語意，還原時不能混在一起。 */
  mode?: ItemDraftMode
  /** 單區塊模式正在編輯哪一區；category 沒有放進 editingSections，另外記。 */
  activeSection?: ItemDraftSection | 'category'
  /** 尚未按下「加入」的單筆輸入；快速編輯時也要能在 iOS 回收後救回來。 */
  noteDraft?: string
  /** 基本資訊裡尚未儲存的 Google Map 網址。舊版是獨立區塊的「還沒按加入」那一格。 */
  mapDraft?: string
  webDraft?: string
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

/**
 * 存檔時被蓋掉的那一版心得，每則只留最近一版，永遠不同步。
 * 心得改成「點畫面其他地方就自動存」之後沒有取消可按，這是唯一的救援路線；
 * 進同一則的編輯狀態時會給一顆「還原上一版」。
 * 不進同步層：兩台裝置各自的上一版要怎麼合併，是個沒有價值的衝突題。
 */
export interface ReviewHistory {
  /** itemId → 上一次被覆蓋掉的內容。 */
  texts: Record<string, string>
  savedAt: number
}

const historyKey = (planId: string) => `travelapp:review-history:${planId}`

export const loadReviewHistory = (planId: string): Promise<ReviewHistory | undefined> =>
  get<ReviewHistory>(historyKey(planId))

export const saveReviewHistory = (planId: string, texts: Record<string, string>): Promise<void> =>
  set(historyKey(planId), { texts, savedAt: Date.now() } satisfies ReviewHistory)
