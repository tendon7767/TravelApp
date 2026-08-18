import type { CostLine, Item, Trip } from '../types'

export const lineTotal = (line: CostLine): number => line.unitPrice * line.qty

/** 依幣別加總，因為同一趟會混用日圓與台幣，不強制換算。 */
export const sumByCurrency = (lines: CostLine[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const l of lines) out[l.currency] = (out[l.currency] ?? 0) + lineTotal(l)
  return out
}

export const itemTotals = (item: Item): Record<string, number> => sumByCurrency(item.costs)

/** 換算成本國幣。外幣乘匯率，本國幣原樣帶過。 */
export const toHome = (totals: Record<string, number>, trip: Trip): number => {
  let sum = 0
  for (const [cur, amt] of Object.entries(totals)) {
    sum += cur === trip.homeCurrency ? amt : amt * trip.rate
  }
  return sum
}

export const mergeTotals = (
  target: Record<string, number>,
  add: Record<string, number>,
): Record<string, number> => {
  for (const [cur, amt] of Object.entries(add)) target[cur] = (target[cur] ?? 0) + amt
  return target
}

const SYMBOLS: Record<string, string> = { TWD: 'NT$', JPY: '¥', USD: '$', KRW: '₩', EUR: '€' }

export const formatMoney = (amount: number, currency: string): string => {
  const sym = SYMBOLS[currency] ?? `${currency} `
  return `${sym}${Math.round(amount).toLocaleString('en-US')}`
}

/** 「¥36,500 · NT$7,665」這種多幣別並列顯示。 */
export const formatTotals = (totals: Record<string, number>): string =>
  Object.entries(totals)
    .filter(([, amt]) => amt !== 0)
    .map(([cur, amt]) => formatMoney(amt, cur))
    .join(' · ')

export const hasCost = (item: Item): boolean => item.costs.some((c) => lineTotal(c) !== 0)

/** 有金額卻沒行程類型 —— 類型支出統計無法歸類，要明確提醒。 */
export const isUncategorized = (item: Item): boolean => hasCost(item) && !item.category
