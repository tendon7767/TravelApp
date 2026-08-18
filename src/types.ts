export const EXPENSE_CATEGORIES = ['交通', '餐飲', '住宿', '娛樂', '購物', '其他'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const PAYMENT_STATUSES = ['尚未付款', '已刷卡', '自動結帳'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

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
  /** 數量單位，純顯示用：人、罐、晚、天 */
  unit?: string
  currency: string
}

export interface LinkRef {
  id: string
  label: string
  url: string
  /** map 會顯示地點圖示，並以地名當標籤 */
  kind: 'map' | 'web'
}

export interface Item extends SyncFields {
  planId: string
  date: string
  /** HH:mm，留空代表純支出、不佔時間軸位置 */
  startTime?: string
  title: string
  /** 遊玩說明：這裡有什麼好吃好玩好看的 */
  guide?: string
  /** 實務提醒，與遊玩說明分開 */
  notes: string[]
  links: LinkRef[]
  costs: CostLine[]
  /** 有金額卻沒填會被標紅 */
  category?: ExpenseCategory
  paymentMethodId?: string
  paymentStatus?: PaymentStatus
  /** 自動結帳的扣款日 */
  chargeDate?: string
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
  payments: PaymentMethod[]
  transports: TransportOption[]
}

export const emptyData = (): AppData => ({
  trips: [],
  plans: [],
  items: [],
  payments: [],
  transports: [],
})
