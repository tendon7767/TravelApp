import type { ItineraryCategory } from '../types'

export interface TemplateRow {
  time: string
  title: string
  cat?: ItineraryCategory
}

/**
 * 取自現有試算表每天重複出現的骨架。
 * 預先帶好行程類型，行程總覽與類型支出統計可以直接沿用。
 */
export const DAY_TEMPLATE: TemplateRow[] = [
  { time: '08:00', title: '起床' },
  { time: '08:30', title: '早餐', cat: '餐飲' },
  { time: '12:00', title: '午餐', cat: '餐飲' },
  { time: '18:30', title: '晚餐', cat: '餐飲' },
  { time: '21:00', title: '住宿', cat: '住宿' },
]
