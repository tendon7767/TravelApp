import type { ExpenseCategory } from '../types'

export interface TemplateRow {
  time: string
  title: string
  cat?: ExpenseCategory
}

/**
 * 取自現有試算表每天重複出現的骨架。
 * 預先帶好費用類型，之後只要填金額，就不會再發生「有金額卻沒分類」被小計漏掉的情形。
 */
export const DAY_TEMPLATE: TemplateRow[] = [
  { time: '08:00', title: '起床' },
  { time: '08:30', title: '早餐', cat: '餐飲' },
  { time: '12:00', title: '午餐', cat: '餐飲' },
  { time: '18:30', title: '晚餐', cat: '餐飲' },
  { time: '21:00', title: '住宿', cat: '住宿' },
]
