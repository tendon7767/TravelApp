/**
 * 心得名牌與氣泡的配色。色號只是索引，實際顏色由 styles.css 的
 * `.review-hue[data-hue]` 定義（名牌底、名牌字、氣泡底三個變數一組，同色系）。
 *
 * 沒指定的人一律中性色 —— 讓「已經分好誰是誰」跟「還沒分」一眼看得出差別。
 * 這份配色存在本機 settings，不同步：它純粹是這台裝置的閱讀偏好。
 */
export const REVIEW_HUES = [
  { hue: 0, label: '藕紫' },
  { hue: 1, label: '霧藍' },
  { hue: 2, label: '草綠' },
  { hue: 3, label: '沙' },
  { hue: 4, label: '陶土' },
] as const

/**
 * 名牌只放一個字。中文取第二個字（「阿翰」→「翰」）比取姓好認，
 * 但英數名字的第二個字母沒有意義，那種就取首字大寫，比較像頭像。
 */
export const tagCharOf = (name: string) => {
  const chars = [...name.trim()]
  if (!chars.length) return '？'
  if (/^[A-Za-z0-9][\w\s.'-]*$/.test(name.trim())) return chars[0].toUpperCase()
  return chars[1] ?? chars[0]
}
