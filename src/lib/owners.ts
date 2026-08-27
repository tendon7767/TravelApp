export const OWNERLESS = '未指定持有人'

/*
 * 現金與其他不是支付方式記錄 —— 沒有回饋規則、不該出現在回饋頁 ——
 * 但仍然要能標在一筆消費上，所以借 paymentMethodId 存保留字。
 * id 都由 newId() 產生不會撞到這兩個字；而且「找不到對應的支付方式就是沒有回饋」
 * 這個行為本來就成立（computeMethod 是用 id 比對挑出自己的花費），
 * 所以回饋計算與同步層都不必為它們改任何東西。
 */
export const OTHER_PAYMENTS = [
  ['cash', '現金'],
  ['other', '其他'],
] as const

/** 卡片在選單裡要標出是誰的，因為多人同行時常常持有同一張卡。 */
export const methodLabel = (name: string, owner?: string): string => {
  const base = name || '未命名'
  const who = owner?.trim()
  return who ? `${base}（${who}）` : base
}
