/** 從 ChatGPT 複製回來的一筆消費。收據總額只拿來核對，不寫進費用資料。 */
export interface ReceiptClipboardCost {
  label?: string
  currency: string
  receiptTotal: number
  items: ReceiptClipboardItem[]
}

export interface ReceiptClipboardItem {
  label: string
  unitPrice: number
  qty: number
}

/** 收據是單純的圖片資料擷取，使用低延遲、支援結構化圖片輸入的 Lite 穩定版。 */
export const RECEIPT_MODEL = 'gemini-3.5-flash-lite'

/** 剪貼簿與相機共用同一份正式格式，兩條資料來源才能走完全相同的驗證與草稿流程。 */
export const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    currency: { type: 'string' },
    receiptTotal: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          unitPrice: { type: 'number' },
          qty: { type: 'number' },
        },
        required: ['label', 'unitPrice', 'qty'],
      },
    },
  },
  required: ['label', 'currency', 'receiptTotal', 'items'],
}

export const buildReceiptAnalysisInput = (foreignCurrency: string, homeCurrency: string): string =>
  JSON.stringify({ allowedCurrencies: [...new Set([foreignCurrency, homeCurrency])] })

const objectOf = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined

const firstOf = (value: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key]
  }
  return undefined
}

const textOf = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

const numberOf = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().replaceAll(',', '')
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseJson = (text: string): unknown => {
  const source = text.replace(/^\uFEFF/, '').trim()
  if (!source) throw new Error('剪貼簿是空的。')

  const candidates = [source]
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  if (fenced) candidates.push(fenced)
  const firstBrace = source.indexOf('{')
  const lastBrace = source.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(source.slice(firstBrace, lastBrace + 1))

  for (const candidate of [...new Set(candidates)]) {
    try {
      return JSON.parse(candidate)
    } catch {
      // 繼續嘗試下一種包法；ChatGPT 常在 JSON 外再加一句說明或程式碼框。
    }
  }
  throw new Error('剪貼簿內容不是可辨識的消費 JSON。')
}

/**
 * 正式格式使用 label / currency / receiptTotal / items；中英文別名只用來容忍
 * ChatGPT 偶爾把欄位名翻譯掉，不把自由文字猜成費用，避免靜默寫錯金額。
 */
export const parseReceiptData = (value: unknown): ReceiptClipboardCost => {
  const root = objectOf(value)
  if (!root) throw new Error('內容必須是一筆消費資料。')

  const totalValue = firstOf(root, ['receiptTotal', 'receipt_total', '收據總額', '總額', 'total'])
  const totalObject = objectOf(totalValue)
  const receiptTotal = numberOf(
    totalObject ? firstOf(totalObject, ['amount', 'value', '金額']) : totalValue,
  )
  if (receiptTotal === undefined) throw new Error('缺少收據印出的總額。')

  const currency = textOf(
    firstOf(root, ['currency', '幣別']) ??
      (totalObject ? firstOf(totalObject, ['currency', '幣別']) : undefined),
  ).toUpperCase()
  if (!currency) throw new Error('缺少收據幣別。')

  const rawItems = firstOf(root, ['items', 'lineItems', 'line_items', '品項', '明細'])
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new Error('收據裡沒有可加入的品項。')

  const items = rawItems.map((rawItem, index): ReceiptClipboardItem => {
    const item = objectOf(rawItem)
    if (!item) throw new Error(`第 ${index + 1} 個品項格式不正確。`)

    const label = textOf(firstOf(item, ['label', 'name', '名稱', '品項']))
    if (!label) throw new Error(`第 ${index + 1} 個品項缺少名稱。`)

    const qty = numberOf(firstOf(item, ['qty', 'quantity', '數量']) ?? 1)
    if (qty === undefined || qty <= 0) throw new Error(`「${label}」的數量不正確。`)

    let unitPrice = numberOf(firstOf(item, ['unitPrice', 'unit_price', 'price', '單價']))
    if (unitPrice === undefined) {
      const itemTotal = numberOf(firstOf(item, ['lineTotal', 'line_total', 'amount', '金額', '小計']))
      if (itemTotal !== undefined) unitPrice = itemTotal / qty
    }
    if (unitPrice === undefined) throw new Error(`「${label}」缺少單價或品項小計。`)

    return { label, unitPrice, qty }
  })

  return {
    label: textOf(firstOf(root, ['label', 'merchant', 'store', '消費名稱', '店名', '商家'])) || undefined,
    currency,
    receiptTotal,
    items,
  }
}

export const parseReceiptClipboard = (text: string): ReceiptClipboardCost =>
  parseReceiptData(parseJson(text))
