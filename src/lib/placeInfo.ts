import type { Item, ItemNote, Trip } from '../types'
import { newId } from './id'

/**
 * 地點分析的回傳結構。這六個欄位名同時出現在三個地方：
 * src/data/placePrompt.md、後端的 PLACE_SCHEMA、以及這裡。改名要三處一起改。
 */
export interface PlaceInfo {
  summary: string
  highlights: string[]
  stayMinutes: number
  timing: string
  nearby: string
  cautions: string[]
}

/**
 * AI 寫的那一段永遠以這一行開頭，而且永遠在最底下。
 * 重新分析時靠它找到上一段的起點整塊換掉 —— 使用者自己寫的內容都在它上面，不會被碰到。
 */
export const AI_BLOCK_MARK = 'AI資訊'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const stayText = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  if (minutes < 60) return `建議停留約 ${Math.round(minutes)} 分鐘`
  // 90 分鐘寫成「1.5 小時」比「90 分鐘」好讀；整點的 .0 要去掉。
  const hours = Math.round((minutes / 60) * 10) / 10
  return `建議停留約 ${hours} 小時`
}

/** 把結構化的結果組成固定排版的文字。排版由這裡決定，不是讓模型自己排。 */
export const formatPlaceInfo = (info: PlaceInfo): string => {
  const blocks: string[] = [AI_BLOCK_MARK]

  const summary = info.summary?.trim()
  if (summary) blocks.push(summary)

  const highlights = (info.highlights ?? []).map((line) => line.trim()).filter(Boolean)
  if (highlights.length) blocks.push(highlights.map((line) => `· ${line}`).join('\n'))

  // 停留時間、時段、順路擠在同一段：三行都短，各自成段會把說明拉得很長。
  const tail = [stayText(info.stayMinutes), info.timing?.trim(), info.nearby?.trim() ? `順路：${info.nearby.trim()}` : '']
    .filter(Boolean)
    .join('\n')
  if (tail) blocks.push(tail)

  return blocks.join('\n\n')
}

/**
 * 新的 AI 區塊取代結尾既有的那一塊，沒有就接在最底下。
 * 由後往前找那一行，因為使用者自己的內容裡也可能剛好打過這三個字。
 */
export const mergeGuide = (guide: string | undefined, block: string): string => {
  const lines = (guide ?? '').split('\n')
  let cut = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === AI_BLOCK_MARK) {
      cut = i
      break
    }
  }
  const kept = (cut >= 0 ? lines.slice(0, cut) : lines).join('\n').replace(/\s+$/, '')
  return kept ? `${kept}\n\n${block}` : block
}

/**
 * 提醒接在既有備註後面。AI 寫的備註刻意不加記號（跟手寫的長一樣），
 * 所以沒辦法在重新分析時挑出上一輪的來換掉 —— 改用內容比對擋掉一字不差的重複。
 * 模型換句話說的話還是會多一條，那時候手動刪掉。
 */
export const appendCautions = (notes: ItemNote[], cautions: string[]): ItemNote[] => {
  const seen = new Set(notes.map((note) => note.text.trim()))
  const added: ItemNote[] = []
  for (const raw of cautions ?? []) {
    const text = raw.trim()
    // showInOverview 刻意不給：哪幾條值得上總覽由使用者自己挑。
    if (!text || seen.has(text)) continue
    seen.add(text)
    added.push({ id: newId(), text })
  }
  return added.length ? [...notes, ...added] : notes
}

/**
 * 送給模型的輸入。整筆行程都給 —— 排定時間、日期、既有內容都會影響它該說什麼，
 * 尤其是「你排 20:00 但這類地方 17:00 就關了」這種對照，只有給了時間才做得到。
 * 星期幾先算好：模型自己做日期運算常常算錯。
 */
export const buildAnalysisInput = (item: Item, trip: Trip): string => {
  const parsed = new Date(`${item.date}T00:00:00`)
  const weekday = Number.isNaN(parsed.getTime()) ? '' : `星期${WEEKDAYS[parsed.getDay()]}`

  return JSON.stringify(
    {
      title: item.title,
      date: item.date,
      weekday,
      startTime: item.startTime ?? '',
      category: item.category ?? '',
      guide: item.guide ?? '',
      notes: item.notes.map((note) => note.text).filter(Boolean),
      costs: item.costs.map((cost) => cost.label).filter(Boolean),
      links: item.links
        .filter((link) => link.url.trim())
        .map((link) => ({ kind: link.kind, label: link.label, url: link.url })),
      trip: {
        name: trip.name,
        startDate: trip.startDate,
        endDate: trip.endDate,
        currency: trip.foreignCurrency,
      },
    },
    null,
    2,
  )
}
