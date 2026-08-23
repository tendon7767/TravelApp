import type { Item, ItemNote, Trip } from '../types'
import { newId } from './id'

/**
 * 地點分析的回傳結構。欄位名出現在兩個地方：這裡（型別與 PLACE_SCHEMA）
 * 與 src/data/placePrompt.md。兩者都在前端，改完 push 就生效。
 */
export interface PlaceInfo {
  summary: string
  highlights: string[]
  bestfoods: string[]
  bestgoods: string[]
  userreviews: string[]
  stayMinutes: number
  timing: string
  nearby: string
  cautions: string[]
}

/**
 * 送給 Gemini 的輸出約束。**這是硬約束：schema 裡沒有的欄位模型根本不會產出**，
 * 只在 prompt 裡寫等於白寫，而且不會有任何錯誤訊息。加欄位要三件事一起做：
 * 這份 schema、上面的 `PlaceInfo`、還有 `formatPlaceInfo` 決定它排在哪裡。
 *
 * 跟 prompt 一樣住在前端隨請求送上去，後端只轉發 —— 這樣加欄位不必再重新部署後端。
 * 型別就在正上方，兩邊對不上一眼看得出來。
 */
export const PLACE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
    bestfoods: { type: 'array', items: { type: 'string' } },
    bestgoods: { type: 'array', items: { type: 'string' } },
    userreviews: { type: 'array', items: { type: 'string' } },
    stayMinutes: { type: 'integer' },
    timing: { type: 'string' },
    nearby: { type: 'string' },
    cautions: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary', 'highlights', 'bestfoods', 'bestgoods', 'userreviews',
    'stayMinutes', 'timing', 'nearby', 'cautions',
  ],
}

/**
 * 讓模型自己上網查。**目前關閉**，因為免費層給不起：
 * ai.dev/rate-limit 的實測是 `Gemini 3 · Search grounding · 0 / 0`，
 * 上限就是零，開著的話每一次請求都直接 429（配額為零跟配額用完回的是同一種錯誤）。
 * 有免費搜尋額度的 Gemini 2 / 2.5 又不支援搜尋與結構化輸出併用 ——
 * 那個組合只有 Gemini 3 以後才有，兩者在免費層裡剛好互斥。
 *
 * 綁了帳單帳戶就解得開（付費層的 Gemini 3.x 另有每月免費額度），
 * 那時候把這行改回 `[{ type: 'google_search' }]` 即可，其他都不必動 ——
 * prompt 裡跟搜尋有關的規則都寫成「查得到才寫」，會自己跟著開關調整。
 */
export const PLACE_TOOLS: unknown[] = []

/**
 * 用哪個模型。免費層的額度隨模型不同，撞到上限就換一個 ——
 * 後端的 GEMINI_MODEL 指令碼屬性仍然可以蓋過它，那是不想 push 時的緊急出口。
 */
export const PLACE_MODEL = 'gemini-3.7-flash'

/**
 * AI 寫的那一段永遠以這一行開頭，而且永遠在最底下。
 * 重新分析時靠它找到上一段的起點整塊換掉 —— 使用者自己寫的內容都在它上面，不會被碰到。
 */
export const AI_BLOCK_MARK = 'AI資訊'

/**
 * 舊資料裡畫過的分隔線。現在改用底色區分兩塊，不再產生它，
 * 但既有的行程說明裡還留著，切割與合併時都要認得並吃掉。
 */
const DIVIDER_LINE = /^─+$/

/** 段落抬頭。單一窄字元，讀起來像一小條色塊，不佔寬度也不會影響折行。 */
const LABEL_MARK = '▍'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const stayText = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  if (minutes < 60) return `建議停留約 ${Math.round(minutes)} 分鐘`
  // 90 分鐘寫成「1.5 小時」比「90 分鐘」好讀；整點的 .0 要去掉。
  const hours = Math.round((minutes / 60) * 10) / 10
  return `建議停留約 ${hours} 小時`
}

const bullets = (lines: string[] | undefined): string[] =>
  (lines ?? []).map((line) => line.trim()).filter(Boolean)

/** 有標題的條列。幾種清單接在一起時，沒有抬頭就分不出哪幾條在講什麼。 */
const listBlock = (label: string, lines: string[]): string =>
  lines.length ? `${LABEL_MARK}${label}\n${lines.map((line) => `· ${line}`).join('\n')}` : ''

/** 把結構化的結果組成固定排版的文字。排版由這裡決定，不是讓模型自己排。 */
export const formatPlaceInfo = (info: PlaceInfo): string => {
  const blocks: string[] = [AI_BLOCK_MARK]

  // summary 不給抬頭：它緊接在標記下面，讀起來就是開場那一句。
  const summary = info.summary?.trim()
  if (summary) blocks.push(summary)

  for (const [label, lines] of [
    ['看點', bullets(info.highlights)],
    ['推薦餐點', bullets(info.bestfoods)],
    ['熱門商品', bullets(info.bestgoods)],
    ['評論摘要', bullets(info.userreviews)],
    // 三件事都只有一行，各自成段會把說明拉得很長，收在同一個抬頭底下。
    ['停留與時段', bullets([
      stayText(info.stayMinutes),
      info.timing ?? '',
      info.nearby?.trim() ? `順路：${info.nearby.trim()}` : '',
    ])],
  ] as const) {
    const block = listBlock(label, lines)
    if (block) blocks.push(block)
  }

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
  // 分隔線畫在標記的上面，切的時候要連它一起吃掉，否則每重跑一次就多疊一條。
  while (cut > 0) {
    const above = lines[cut - 1].trim()
    if (above !== '' && !DIVIDER_LINE.test(above)) break
    cut -= 1
  }

  const kept = (cut >= 0 ? lines.slice(0, cut) : lines).join('\n').replace(/\s+$/, '')
  return kept ? `${kept}\n\n${block}` : block
}

/**
 * 顯示用：把說明拆成「使用者自己寫的」與「AI 寫的」兩段，詳細頁各自用不同底色算繪。
 * `AI資訊` 那一行與舊資料的分隔線都不回傳 —— 右上角的圖示已經在講同一件事，
 * 兩個記號並存只是重複。但它們必須留在存下來的字串裡，`mergeGuide` 靠標記定位。
 */
export const splitGuide = (guide: string | undefined): { own: string; ai: string } => {
  const lines = (guide ?? '').split('\n')
  let cut = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === AI_BLOCK_MARK) {
      cut = i
      break
    }
  }
  if (cut < 0) return { own: (guide ?? '').trim(), ai: '' }

  let ownEnd = cut
  while (ownEnd > 0) {
    const above = lines[ownEnd - 1].trim()
    if (above !== '' && !DIVIDER_LINE.test(above)) break
    ownEnd -= 1
  }
  return {
    own: lines.slice(0, ownEnd).join('\n').trim(),
    ai: lines.slice(cut + 1).join('\n').trim(),
  }
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
