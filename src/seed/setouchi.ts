import type { ExpenseCategory, PaymentStatus } from '../types'

/**
 * 從「2026 秋季 瀨戶內海9日遊」試算表方案 A 轉換而來。
 * 刻意不修正原始資料的問題（例如 Hotel Trend 那筆缺類型），
 * 讓 App 的防呆自己把它抓出來，由你決定怎麼改。
 */
export interface SeedCost {
  label: string
  unitPrice: number
  qty?: number
  unit?: string
  cur?: 'JPY' | 'TWD'
}

export interface SeedItem {
  day: number
  time?: string
  title: string
  notes?: string[]
  links?: { label: string; url: string }[]
  costs?: SeedCost[]
  cat?: ExpenseCategory
  pay?: PaymentStatus
  chargeDay?: number
}

const ITEMS: SeedItem[] = [
  { day: 1, time: '08:00', title: '桃園機場捷運 台北車站 → 桃園機場 T1', costs: [{ label: '機捷', unitPrice: 150, qty: 2, unit: '人', cur: 'TWD' }], cat: '交通' },
  { day: 1, time: '09:10', title: '台灣虎航 IT214 　11:10 TPE → 14:35 OKJ 岡山桃太郎機場', notes: ['航班動態查詢'], costs: [{ label: '來回機票', unitPrice: 6862, qty: 2, unit: '人', cur: 'TWD' }], cat: '交通' },
  { day: 1, time: '15:10', title: '機場快速買點東西吃' },
  { day: 1, time: '15:30', title: '機場巴士', notes: ['搭乘巴士資訊｜岡山機場'], costs: [{ label: '機場巴士 單程 1000', unitPrice: 1000, qty: 2, unit: '人' }], cat: '交通' },
  { day: 1, time: '16:00', title: '到岡山站 去旅館入住' },
  { day: 1, time: '17:00', title: '逛百貨公司 AEON Mall Okayama' },
  { day: 1, time: '18:30', title: '晚餐', costs: [{ label: '晚餐', unitPrice: 5000 }], cat: '餐飲' },
  { day: 1, time: '20:00', title: '繼續逛百貨公司 AEON Mall Okayama' },
  { day: 1, time: '21:30', title: '逛 Donki Don Quijote Okayama-ekimae' },
    // 原始試算表這一列的「類型」是空的，於是被小計公式整筆跳過，NT$3,264 就這樣消失了。
  { day: 1, time: '22:00', title: '旅館休息 Hotel Trend Okayama-Ekimae', notes: ['一休中文版 11/1 自動結帳'], costs: [{ label: '住宿', unitPrice: 16320 }], pay: '自動結帳', chargeDay: 2 },

  { day: 2, time: '08:30', title: '起床' },
  { day: 2, time: '09:00', title: '飯店早餐', costs: [{ label: '早餐', unitPrice: 0 }], cat: '餐飲' },
  { day: 2, time: '10:00', title: 'check out 搭計程車去牽車', costs: [{ label: 'TAXI', unitPrice: 2000 }], cat: '交通' },
  { day: 2, time: '10:30', title: '租車 Ｊネットレンタカー岡山北店', costs: [{ label: '租車 8 天', unitPrice: 25500 }], cat: '交通' },
  { day: 2, time: '11:30', title: '午餐', costs: [{ label: '午餐', unitPrice: 3000 }], cat: '餐飲' },
  { day: 2, time: '12:30', title: '逛街 三井 OUTLET 倉敷' },
  { day: 2, time: '15:00', title: '倉敷美觀地區 市營停車場', notes: ['停車費 100/30min'], cat: '交通' },
  { day: 2, time: '15:30', title: '逛街 倉敷美観地区' },
  { day: 2, time: '18:00', title: '晚餐', costs: [{ label: '晚餐', unitPrice: 5000 }], cat: '餐飲' },
  { day: 2, time: '20:00', title: '逛街 Ario 倉敷' },
  { day: 2, time: '21:30', title: '飯店合作停車場 カモ井パーキング', costs: [{ label: '停車費', unitPrice: 1000 }], cat: '交通' },
  { day: 2, time: '22:00', title: '旅館休息 APA HOTEL KURASHIKI-EKIMAE', notes: ['AGODA 已刷卡'], costs: [{ label: '住宿', unitPrice: 1595, cur: 'TWD' }], cat: '住宿', pay: '已刷卡' },
]

export const SETOUCHI = {
  name: '2026 秋季 瀨戶內海9日遊',
  startDate: '2026-10-31',
  endDate: '2026-11-08',
  foreignCurrency: 'JPY',
  rate: 0.21,
  items: ITEMS,
}
