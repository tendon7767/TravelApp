export const ITINERARY_CATEGORIES = ['景點', '交通', '餐飲', '住宿', '活動', '購物', '其他'] as const
export type ItineraryCategory = (typeof ITINERARY_CATEGORIES)[number]

/** 每筆記錄都帶同步欄位，M4 接上試算表時直接沿用，不必回頭改資料結構。 */
export interface SyncFields {
  id: string
  updatedAt: number
  updatedBy: string
  deleted?: boolean
}

export interface Trip extends SyncFields {
  name: string
  /** YYYY-MM-DD */
  startDate: string
  endDate: string
  /** 記帳的本國幣別，預設 TWD */
  homeCurrency: string
  /** 這趟的外幣，一趟一種 */
  foreignCurrency: string
  /** 外幣換算本國幣的匯率，手填。改了之後所有換算金額重算。 */
  rate: number
}

/** 行程版本。回饋計算只認 kind === 'actual' 的版本。 */
export interface Plan extends SyncFields {
  tripId: string
  name: string
  kind: 'planning' | 'actual'
  basedOnPlanId?: string
}

/** 費用明細一行：單價 × 數量 = 小計。 */
export interface CostLine {
  id: string
  label: string
  unitPrice: number
  qty: number
  currency: string
}

export interface LinkRef {
  id: string
  label: string
  url: string
  /** map 會顯示地點圖示，並以地名當標籤 */
  kind: 'map' | 'web'
}

export interface ItemNote {
  id: string
  text: string
  /** 勾選後把這則提醒顯示在行程總覽。 */
  showInOverview?: boolean
}

export interface Item extends SyncFields {
  planId: string
  date: string
  /** HH:mm，留空代表純支出、不佔時間軸位置 */
  startTime?: string
  title: string
  /** 遊玩說明：這裡有什麼好吃好玩好看的，行前就會寫 */
  guide?: string
  /** 實務提醒，與遊玩說明分開 */
  notes: ItemNote[]
  links: LinkRef[]
  costs: CostLine[]
  /** 行程本身的類型；沿用既有 category 儲存欄位，避免破壞舊試算表。 */
  category?: ItineraryCategory
  paymentMethodId?: string
}

/**
 * 一張卡可以有多組回饋規則（一般、加碼、通路限定），彼此同時累積。
 * 消費上限不存在這裡，因為它恆等於 rewardCap / rate，手填只會多一個對不起來的來源。
 *   rewardCap       這趟能拿到的回饋總額上限
 *   perTxnRewardCap 單筆交易的回饋上限 —— 這是拆單建議的依據
 */
export interface RewardRule {
  id: string
  name: string
  rate: number
  rewardCap?: number
  perTxnRewardCap?: number
}

export interface PaymentMethod extends SyncFields {
  tripId: string
  name: string
  owner?: string
  kind: 'card' | 'epay'
  /** 這趟有沒有帶著它。記帳時只列出帶著的。 */
  enabled: boolean
  /** 回饋上限與消費上限所使用的幣別，各家卡不同（有的算台幣、有的算日圓）。 */
  currency: string
  rules: RewardRule[]
  note?: string
}

/**
 * 心得刻意做成獨立記錄而不是項目裡的欄位。
 * 一人一則、每則只有作者本人會寫，所以「後寫入者勝」永遠不會弄丟別人的內容 ——
 * 若塞在項目裡，同步時整筆項目被覆蓋，同行者剛寫好的那段就沒了。
 */
export interface Review extends SyncFields {
  itemId: string
  author: string
  text: string
}

/** 照片本體放在 Drive；這裡只同步可查詢、刪除與顯示所需的 metadata。 */
export interface Photo extends SyncFields {
  tripId: string
  itemId: string
  kind: 'receipt' | 'trip'
  fileId: string
  fileUrl: string
  thumbnailFileId: string
  thumbnailUrl: string
  mimeType: 'image/jpeg'
  width: number
  height: number
  byteSize: number
}

/** 筆記內容是段落與勾選項的混排 —— 打包清單能成立的前提。 */
export interface NoteBlock {
  id: string
  kind: 'text' | 'check'
  text: string
  done?: boolean
}

export interface Note extends SyncFields {
  tripId: string
  title: string
  blocks: NoteBlock[]
  links: LinkRef[]
}

/** 租車 vs 電車巴士這種方案並排比價，與行程無關，純試算。 */
export interface TransportOption extends SyncFields {
  tripId: string
  name: string
  lines: CostLine[]
}

export interface AppData {
  trips: Trip[]
  plans: Plan[]
  items: Item[]
  reviews: Review[]
  photos: Photo[]
  notes: Note[]
  payments: PaymentMethod[]
  transports: TransportOption[]
}

export const emptyData = (): AppData => ({
  trips: [],
  plans: [],
  items: [],
  reviews: [],
  photos: [],
  notes: [],
  payments: [],
  transports: [],
})
