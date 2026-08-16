export const EXPENSE_CATEGORIES = ['交通', '餐飲', '住宿', '娛樂', '購物', '其他'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const PAYMENT_STATUSES = ['未付', '已刷卡', '自動結帳', '現場付'] as const
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

export interface AppData {
  trips: Trip[]
  plans: Plan[]
  items: Item[]
}

export const emptyData = (): AppData => ({ trips: [], plans: [], items: [] })
