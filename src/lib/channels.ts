import type { PaymentMethod } from '../types'

/**
 * 通路標籤（大國藥妝、BIC CAMERA…）沒有獨立的同步集合 —— 規則裡存的就是名字本身，
 * 跟著 `payments.rules` 這個 JSON 欄位一起同步，所以同行者沒有任何清單也算得對。
 *
 * 代價是「同一個通路被打成兩種字串」必須自己擋，所以比對一律先正規化：
 * 全形轉半形（NFKC）、去頭尾空白、忽略大小寫。
 * 存進資料的永遠是使用者打的那個樣子，只有比對與去重用這支 —— 畫面上要看到自己打的字。
 */
export const channelKey = (name: string): string => name.normalize('NFKC').trim().toLowerCase()

/** 兩個標籤是不是同一個。 */
export const sameChannel = (a: string, b: string): boolean => channelKey(a) === channelKey(b)

/*
 * 清單一律 a-z，跟支付方式名稱用同一組比較器 —— 全 App 兩份清單排法不同會很怪。
 * 英文（BIC CAMERA、Yodobashi）排在前，中日文接在後面依碼位，不是字典序但完全可預測。
 */
const byName = (a: string, b: string) =>
  a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true })

/**
 * 通路清單是「衍生」出來的：所有規則用過的名字的聯集，沒有另外一份要維護的註冊表。
 * 所以「刪除」是自動的 —— 沒有任何規則引用它，下次算就不見了。
 */
export const channelsOf = (payments: PaymentMethod[]): string[] => {
  const seen = new Map<string, string>()
  for (const payment of payments) {
    if (payment.deleted) continue
    for (const rule of payment.rules) {
      for (const name of rule.channels ?? []) {
        const trimmed = name.trim()
        if (trimmed && !seen.has(channelKey(trimmed))) seen.set(channelKey(trimmed), trimmed)
      }
    }
  }
  return [...seen.values()].sort(byName)
}

/** 排好序、且不會出現兩個正規化後相同的名字。 */
export const sortChannels = (names: string[]): string[] => {
  const seen = new Map<string, string>()
  for (const name of names) {
    const trimmed = name.trim()
    if (trimmed && !seen.has(channelKey(trimmed))) seen.set(channelKey(trimmed), trimmed)
  }
  return [...seen.values()].sort(byName)
}

/**
 * 套用一批改名（正規化後的舊名 → 新名），並收掉因此撞在一起的重複（改名撞名＝合併）。
 * 沒有任何一個名字被換掉時回傳原本那個陣列本身，呼叫端才能用 !== 判斷要不要寫回去。
 */
export const applyChannelRenames = (
  names: string[] | undefined,
  renames: Map<string, string>,
): string[] | undefined => {
  if (!names?.length) return names
  const mapped = names.map((name) => renames.get(channelKey(name)) ?? name)
  return mapped.some((name, i) => name !== names[i]) ? sortChannels(mapped) : names
}

/** 單一標籤（費用群組的通路）的改名。 */
export const renameChannel = (
  channel: string | undefined,
  renames: Map<string, string>,
): string | undefined => (channel ? (renames.get(channelKey(channel)) ?? channel) : channel)
