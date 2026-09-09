/**
 * 批次匯入吃的 JSON 格式，與它的驗證。
 *
 * 這一頁沒有內建任何旅程資料 —— 要寫什麼由使用者當場貼進來（通常是從對話裡複製）。
 * 所以驗證的錯誤訊息要指得出是第幾筆、哪個欄位，貼錯了才有辦法自己修。
 */
import type { ItineraryCategory } from '../types'
import { ITINERARY_CATEGORIES } from '../types'
import type { PlaceInfo } from '../lib/placeInfo'

export interface Seed {
  /** 排進哪一天，YYYY-MM-DD */
  date: string
  /** HH:mm。留空就會落在當天最底，也不會被算成「現在進行中」。 */
  startTime?: string
  title: string
  category?: ItineraryCategory
  /** 相關連結。地圖連結不從這裡給 —— 沒有座標的連結會讓那筆被當成「已有地圖」。 */
  webUrl?: string
  webLabel?: string
  /** 使用者段落的說明。會放在 AI 區塊的上面。 */
  guide?: string
  /** 額外的備註，接在 place.cautions 後面。 */
  notes?: string[]
  /** 有值＝這一天已經有這筆，只補說明不新增（同一版、同一天、標題一字不差）。 */
  matchTitle?: string
  /** 查到的地點資訊。給了就會排版成「AI資訊」區塊接在說明最底下。 */
  place?: Partial<PlaceInfo>
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

/** 缺的欄位補成空的：貼進來的 JSON 不必八個欄位都寫齊。 */
export const fillPlace = (place: Partial<PlaceInfo>): PlaceInfo => ({
  summary: place.summary ?? '',
  highlights: place.highlights ?? [],
  bestfoods: place.bestfoods ?? [],
  bestgoods: place.bestgoods ?? [],
  userreviews: place.userreviews ?? [],
  stayMinutes: place.stayMinutes ?? 0,
  timing: place.timing ?? '',
  nearby: place.nearby ?? '',
  cautions: place.cautions ?? [],
})

/**
 * 解析並檢查。丟出來的 Error 會直接顯示給使用者看，所以訊息要說得出哪裡不對。
 * 允許單一物件（只寫一筆時不必包成陣列）。
 */
export const parseSeeds = (raw: string): Seed[] => {
  const text = raw.trim()
  if (!text) throw new Error('請先貼上要寫入的內容（JSON）')

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error(`JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`)
  }

  const rows = Array.isArray(data) ? data : [data]
  if (!rows.length) throw new Error('這份 JSON 裡沒有任何一筆')

  return rows.map((row, index) => {
    const at = `第 ${index + 1} 筆`
    if (!row || typeof row !== 'object') throw new Error(`${at}不是物件`)
    const seed = row as Record<string, unknown>

    const date = String(seed.date ?? '')
    if (!DATE_RE.test(date)) throw new Error(`${at}的 date 要是 YYYY-MM-DD，收到「${date}」`)

    const title = String(seed.title ?? '').trim()
    if (!title) throw new Error(`${at}少了 title`)

    const startTime = seed.startTime ? String(seed.startTime) : undefined
    if (startTime && !TIME_RE.test(startTime)) {
      throw new Error(`${at}的 startTime 要是 HH:mm，收到「${startTime}」`)
    }

    const category = seed.category ? String(seed.category) : undefined
    if (category && !ITINERARY_CATEGORIES.includes(category as ItineraryCategory)) {
      throw new Error(`${at}的 category「${category}」不在 ${ITINERARY_CATEGORIES.join('／')} 裡`)
    }

    const notes = Array.isArray(seed.notes) ? seed.notes.map((note) => String(note)) : undefined

    return {
      date,
      startTime,
      title,
      category: category as ItineraryCategory | undefined,
      webUrl: seed.webUrl ? String(seed.webUrl) : undefined,
      webLabel: seed.webLabel ? String(seed.webLabel) : undefined,
      guide: seed.guide ? String(seed.guide) : undefined,
      notes,
      matchTitle: seed.matchTitle ? String(seed.matchTitle) : undefined,
      place: seed.place && typeof seed.place === 'object' ? (seed.place as Partial<PlaceInfo>) : undefined,
    }
  })
}

/** 貼進欄位的範例，同時是格式說明 —— 看得到的例子比寫一段規格好懂。 */
export const SAMPLE = JSON.stringify(
  [
    {
      date: '2026-09-10',
      startTime: '12:35',
      title: '購物 某某菓子店',
      category: '購物',
      webUrl: 'https://example.com/',
      webLabel: '官方網站',
      place: {
        summary: '一句話說明這是什麼。',
        highlights: ['到現場不會想錯過的事'],
        bestfoods: ['招牌餐點：為什麼值得吃'],
        bestgoods: ['熱門商品：為什麼值得買'],
        userreviews: ['查到的評論重點'],
        stayMinutes: 20,
        timing: '什麼時段來最好',
        nearby: '走路可到的順路去處',
        cautions: ['出發前要確認的事'],
      },
    },
  ],
  null,
  2,
)
