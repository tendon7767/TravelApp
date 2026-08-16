import type { ExpenseCategory, PaymentStatus } from '../types'

/**
 * 從「2026 秋季 瀨戶內海9日遊」試算表方案 A 轉換而來。
 * 刻意不修正原始資料的問題（缺類型、疑似重複計價的船資），
 * 讓 App 的防呆自己抓出來，由使用者決定怎麼改。
 * 原表中完全空白的時段骨架列不匯入，因為 App 改用自由新增 + 每日範本。
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
  { day: 1, time: '09:10', title: '台灣虎航 IT214　11:10 TPE → 14:35 OKJ 岡山桃太郎機場', notes: ['航班動態查詢'], costs: [{ label: '來回機票', unitPrice: 6862, qty: 2, unit: '人', cur: 'TWD' }], cat: '交通' },
  { day: 1, time: '15:10', title: '機場快速買點東西吃' },
  { day: 1, time: '15:30', title: '機場巴士', notes: ['搭乘巴士資訊｜岡山機場'], costs: [{ label: '機場巴士 單程 1000', unitPrice: 1000, qty: 2, unit: '人' }], cat: '交通' },
  { day: 1, time: '16:00', title: '到岡山站 去旅館入住' },
  { day: 1, time: '17:00', title: '逛百貨公司 AEON Mall Okayama' },
  { day: 1, time: '18:30', title: '晚餐', costs: [{ label: '晚餐', unitPrice: 5000 }], cat: '餐飲' },
  { day: 1, time: '20:00', title: '繼續逛百貨公司 AEON Mall Okayama' },
  { day: 1, time: '21:30', title: '逛 Donki Don Quijote Okayama-ekimae' },
  // 原表這一列「類型」空白，於是被小計公式整筆跳過，NT$3,264 就這樣消失了。
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

  { day: 3, time: '08:30', title: '起床' },
  { day: 3, time: '09:30', title: '退房 買點東西簡單吃吃', costs: [{ label: '早餐', unitPrice: 2000 }], cat: '餐飲' },
  { day: 3, time: '10:30', title: '倉敷美觀地區 市營停車場', notes: ['停車費 100/30min'], cat: '交通' },
  { day: 3, time: '11:00', title: '逛倉敷老街' },
  { day: 3, time: '12:30', title: '午餐', costs: [{ label: '午餐', unitPrice: 3000 }], cat: '餐飲' },
  { day: 3, time: '13:30', title: '出發到宇野港' },
  { day: 3, time: '14:30', title: '連車搭船前往直島　四国汽船 宇野→直島（宮浦）15:30 → 15:50', notes: ['四国汽船船班資訊'], costs: [{ label: '船票', unitPrice: 370, qty: 1, unit: '人' }, { label: '車運費', unitPrice: 2390 }], cat: '交通' },
  { day: 3, time: '18:30', title: '晚餐', costs: [{ label: '晚餐', unitPrice: 5000 }], cat: '餐飲' },
  { day: 3, time: '21:00', title: '住直島 海之家 つつじ莊', notes: ['一休中文版 11/3 自動結帳'], costs: [{ label: '住宿', unitPrice: 15840 }], cat: '住宿', pay: '自動結帳', chargeDay: 4 },

  { day: 4, time: '08:00', title: '直島觀光一天', costs: [{ label: '早餐', unitPrice: 2000 }], cat: '餐飲' },
  { day: 4, time: '12:00', title: '午餐', costs: [{ label: '午餐', unitPrice: 3000 }], cat: '餐飲' },
  // 原表此列只有類型與金額，沒有任何說明。金額等於方案 B 的「直島→宇野」二人份船資。
  { day: 4, time: '16:00', title: '交通費（原表未填說明）', notes: ['原表此列僅有類型與金額'], costs: [{ label: '', unitPrice: 3130 }], cat: '交通' },
  { day: 4, time: '18:30', title: '晚餐', costs: [{ label: '晚餐', unitPrice: 5000 }], cat: '餐飲' },
  { day: 4, time: '18:50', title: '交通費（原表未填說明）', notes: ['原表此列僅有類型與金額'], costs: [{ label: '', unitPrice: 6430 }], cat: '交通' },
  { day: 4, time: '21:00', title: '住直島 海之家 つつじ莊', notes: ['一休中文版 11/3 自動結帳'], costs: [{ label: '住宿', unitPrice: 15840 }], cat: '住宿', pay: '自動結帳', chargeDay: 4 },

  { day: 5, time: '06:15', title: '早餐', cat: '餐飲' },
  { day: 5, time: '09:00', title: '連車搭船回宇野　四国汽船 直島（宮浦）→宇野 09:52 → 10:12', notes: ['四国汽船船班資訊'], costs: [{ label: '船票', unitPrice: 370, qty: 1, unit: '人' }, { label: '車運費', unitPrice: 2390 }], cat: '交通' },
  { day: 5, time: '10:30', title: '連車搭船前往豐島　小豆島豊島フェリー 宇野港⇔家浦港 11:10 → 11:50', notes: ['小豆島フェリー船班資訊'], costs: [{ label: '船票', unitPrice: 780, qty: 1, unit: '人' }, { label: '車運費', unitPrice: 4870 }], cat: '交通' },
  { day: 5, time: '12:00', title: '午餐', costs: [{ label: '午餐', unitPrice: 3000 }], cat: '餐飲' },
  { day: 5, time: '14:00', title: '豐島觀光半天' },
  { day: 5, time: '15:30', title: '交通費（原表未填說明）', notes: ['原表此列僅有類型與金額'], costs: [{ label: '', unitPrice: 4610 }], cat: '交通' },
  { day: 5, time: '18:30', title: '晚餐', costs: [{ label: '晚餐', unitPrice: 5000 }], cat: '餐飲' },
  { day: 5, time: '21:00', title: '住豐島 ホテル聚（Hotel SHU）', notes: ['等特價', 'AGODA 已刷卡'], costs: [{ label: '住宿', unitPrice: 4803, cur: 'TWD' }], cat: '住宿', pay: '已刷卡' },

  { day: 6, time: '08:00', title: '早餐', costs: [{ label: '早餐', unitPrice: 2000 }], cat: '餐飲' },
  { day: 6, time: '11:00', title: '連車搭船前往小豆島　小豆島豊島フェリー 唐櫃港⇔土庄港 12:10 → 12:39', notes: ['小豆島フェリー船班資訊'], costs: [{ label: '船票', unitPrice: 490, qty: 1, unit: '人' }, { label: '車運費', unitPrice: 3630 }], cat: '交通' },
  { day: 6, time: '12:00', title: '午餐', costs: [{ label: '午餐', unitPrice: 3000 }], cat: '餐飲' },
  { day: 6, time: '14:00', title: '小豆島觀光半天' },
  { day: 6, time: '17:00', title: '旅館 check in' },
  { day: 6, time: '18:30', title: '晚餐', costs: [{ label: '晚餐', unitPrice: 5000 }], cat: '餐飲' },
  { day: 6, time: '21:00', title: '住小豆島 Millennium Olive Terrace - The Stay', notes: ['Booking 已刷卡'], costs: [{ label: '住宿', unitPrice: 8733, cur: 'TWD' }], cat: '住宿', pay: '已刷卡' },

  { day: 7, time: '08:00', title: '飯店早餐', costs: [{ label: '早餐', unitPrice: 0 }], cat: '餐飲' },
  { day: 7, time: '10:30', title: '退房' },
  { day: 7, time: '12:00', title: '午餐', costs: [{ label: '午餐', unitPrice: 3000 }], cat: '餐飲' },
  { day: 7, time: '14:00', title: '小豆島觀光一天' },
  { day: 7, time: '16:00', title: '旅館 check in' },
  { day: 7, time: '18:30', title: '飯店晚餐', costs: [{ label: '晚餐', unitPrice: 0 }], cat: '餐飲' },
  { day: 7, time: '21:00', title: '住小豆島 天空ホテル 海廬（かいろ）', notes: ['一休中文版 11/6 自動結帳'], costs: [{ label: '住宿', unitPrice: 29700 }], cat: '住宿', pay: '自動結帳', chargeDay: 7 },

  { day: 8, time: '08:00', title: '飯店早餐', costs: [{ label: '早餐', unitPrice: 0 }], cat: '餐飲' },
  // 金額等於方案 B「土庄港⇒新岡山港」的二人份船資，與當天 13:00 那筆同一段航程。
  { day: 8, time: '10:30', title: '交通費（原表未填說明）', notes: ['原表此列僅有類型與金額'], costs: [{ label: '', unitPrice: 8890 }], cat: '交通' },
  { day: 8, time: '11:30', title: '午餐', costs: [{ label: '午餐', unitPrice: 3000 }], cat: '餐飲' },
  { day: 8, time: '13:00', title: '連車搭船前往新岡山港　国際両備フェリー 土庄港⇒新岡山港 14:00 → 15:10', notes: ['国際両備フェリー 岡山航路部 船班資訊'], costs: [{ label: '船票', unitPrice: 1200, qty: 1, unit: '人' }, { label: '車運費', unitPrice: 6490 }], cat: '交通' },
  { day: 8, time: '18:30', title: '晚餐', costs: [{ label: '晚餐', unitPrice: 5000 }], cat: '餐飲' },
  { day: 8, time: '21:00', title: '回岡山 岡山国際ホテル', notes: ['Booking 11/4 扣款'], costs: [{ label: '住宿', unitPrice: 4851, cur: 'TWD' }], cat: '住宿', pay: '自動結帳', chargeDay: 5 },

  { day: 9, time: '08:00', title: '早餐', costs: [{ label: '早餐', unitPrice: 2000 }], cat: '餐飲' },
  { day: 9, time: '11:00', title: '還車', notes: ['岡山馬拉松 要查交通管制資料'] },
  { day: 9, time: '12:00', title: '午餐', costs: [{ label: '午餐', unitPrice: 3000 }], cat: '餐飲' },
  { day: 9, time: '13:00', title: '前往機場', cat: '交通' },
  { day: 9, time: '16:15', title: '台灣虎航 IT715　17:55 OKJ → 19:55 TPE 桃園機場 T1', notes: ['航班動態查詢'] },
  { day: 9, time: '20:00', title: '機場捷運', costs: [{ label: '機場捷運', unitPrice: 150, qty: 2, unit: '人', cur: 'TWD' }], cat: '交通' },
  { day: 9, time: '21:00', title: '溫暖的家' },
]

export const SETOUCHI = {
  name: '2026 秋季 瀨戶內海9日遊',
  startDate: '2026-10-31',
  endDate: '2026-11-08',
  foreignCurrency: 'JPY',
  rate: 0.21,
  items: ITEMS,
}
