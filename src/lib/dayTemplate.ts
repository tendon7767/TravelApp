import type { ItineraryCategory } from '../types'

/** 這一列只在哪幾天建。不寫就是每天都建。 */
export type TemplateWhen = 'first' | 'last' | 'exceptFirst' | 'exceptLast'

export interface TemplateRow {
  time: string
  title: string
  cat?: ItineraryCategory
  /**
   * 要沿用哪一顆快選的預設值（費用、備註、說明），寫快選的標題。
   * 沒寫就什麼都不帶 —— 起床與三餐維持空白。
   */
  quick?: string
  when?: TemplateWhen
}

/**
 * 取自現有試算表每天重複出現的骨架。
 * 預先帶好行程類型，行程總覽與類型支出統計可以直接沿用。
 */
export const DAY_TEMPLATE: TemplateRow[] = [
  { time: '08:00', title: '起床' },
  { time: '08:30', title: '早餐', cat: '餐飲', when: 'exceptFirst' },
  { time: '10:00', title: '退房', cat: '其他', quick: '退房', when: 'exceptFirst' },
  { time: '12:00', title: '午餐', cat: '餐飲' },
  { time: '18:30', title: '晚餐', cat: '餐飲' },
  { time: '21:00', title: '住宿', cat: '住宿', quick: '住宿', when: 'exceptLast' },

  // 出發日：出門、飛過去、進市區、進飯店。早餐在家吃，不佔一列。
  { time: '08:30', title: '機場捷運', cat: '交通', quick: '鐵路', when: 'first' },
  { time: '10:00', title: '飛機', cat: '交通', quick: '飛機', when: 'first' },
  { time: '15:30', title: '鐵路 前往市區', cat: '交通', quick: '鐵路', when: 'first' },
  { time: '17:00', title: '入住', cat: '住宿', quick: '入住', when: 'first' },

  // 回程日：去機場、飛回來、到家。
  { time: '13:30', title: '鐵路 前往機場', cat: '交通', quick: '鐵路', when: 'last' },
  { time: '15:30', title: '飛機', cat: '交通', quick: '飛機', when: 'last' },
  { time: '20:30', title: '機場捷運', cat: '交通', quick: '鐵路', when: 'last' },
  { time: '22:00', title: '到家', cat: '其他', when: 'last' },
]

/**
 * 挑出這一天要建的骨架。只有一天的旅程，first 與 last 同時成立，
 * 所以 exceptFirst／exceptLast 那幾列（退房、住宿）都不會出現，剛好是對的。
 */
export const templateRowsFor = (first: boolean, last: boolean): TemplateRow[] =>
  DAY_TEMPLATE.filter((row) => {
    switch (row.when) {
      case 'first':
        return first
      case 'last':
        return last
      case 'exceptFirst':
        return !first
      case 'exceptLast':
        return !last
      default:
        return true
    }
  })
