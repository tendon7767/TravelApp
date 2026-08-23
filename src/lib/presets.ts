import presets from '../data/itineraryPresets.json'
import type { CostLine, ItemNote, ItineraryCategory, Trip } from '../types'
import { newId } from './id'

/**
 * 行程類型與快選項目的預設值全部集中在 src/data/itineraryPresets.json，讓它可以直接手改。
 * 這裡只負責把那份資料接上型別、處理繼承，以及套用規則。
 */
interface PresetBody {
  /** null 代表「這個項目不要帶費用」，沒寫則沿用類型層級的設定。 */
  預設費用?: { 項目: string; 單位?: string } | null
  /** 只寫字串就是一般備註；要直接出現在行程列上的寫成 { 文字, 總覽 }。 */
  預設備註?: (string | { 文字: string; 總覽?: boolean })[]
  /** 一行一個元素，帶入時接成一段純文字。null 代表這個項目不要帶說明。 */
  預設說明?: string[] | null
}

interface QuickRow extends PresetBody {
  標題: string
  時間: string
}

interface CategoryRow extends PresetBody {
  快選?: QuickRow[]
}

const CATEGORY_PRESETS = presets.類型 as Partial<Record<ItineraryCategory, CategoryRow>>

/** 解析後的預設值，已經處理過快選蓋掉類型的繼承。 */
export interface Preset {
  cost?: { label: string }
  /** 行程說明的起手式，例如航班要填的那幾欄。 */
  guide?: string
  notes: { text: string; showInOverview?: boolean }[]
}

const readNotes = (rows: PresetBody['預設備註']): Preset['notes'] | undefined =>
  rows?.map((row) =>
    typeof row === 'string'
      ? { text: row }
      : { text: row.文字, showInOverview: row.總覽 || undefined },
  )

/** 「有寫這個鍵就以它為準（含寫 null 代表不要帶），沒寫才沿用上一層」。費用與說明共用這條規則。 */
const has = (row: PresetBody | undefined, key: keyof PresetBody) =>
  row ? Object.prototype.hasOwnProperty.call(row, key) : false

const readBody = (row: PresetBody | undefined, fallback?: Preset): Preset => {
  const ownCost = has(row, '預設費用')
  const rawCost = ownCost ? row?.預設費用 : undefined
  const ownGuide = has(row, '預設說明')
  const rawGuide = ownGuide ? row?.預設說明 : undefined
  return {
    cost: ownCost
      ? (rawCost ? { label: rawCost.項目 } : undefined)
      : fallback?.cost,
    guide: ownGuide
      ? (rawGuide?.length ? rawGuide.join('\n') : undefined)
      : fallback?.guide,
    notes: readNotes(row?.預設備註) ?? fallback?.notes ?? [],
  }
}

/** 類型層級的預設值只當作它底下快選項目的繼承基底，不會單獨套用到任何項目上。 */
const categoryPreset = (category: ItineraryCategory): Preset =>
  readBody(CATEGORY_PRESETS[category])

export interface QuickItem {
  title: string
  /** 這個項目的預設時段，一律照建，不管當天有沒有別的項目。 */
  time: string
  /** 已經跟類型層級合併過。飛機與地鐵的費用名稱、備註本來就該不一樣。 */
  preset: Preset
}

export const quickItemsFor = (category: ItineraryCategory): QuickItem[] => {
  const row = CATEGORY_PRESETS[category]
  const base = readBody(row)
  return (row?.快選 ?? []).map((quick) => ({
    title: quick.標題,
    time: quick.時間,
    preset: readBody(quick, base),
  }))
}

/** 子項少於兩個就不值得多跳一層選單，點類型直接建立。 */
export const needsSecondLevel = (category: ItineraryCategory): boolean =>
  quickItemsFor(category).length > 1

/** 沒設快選的類型就用類型名當標題，不讓任何一格點下去沒反應。 */
export const soleQuickItem = (category: ItineraryCategory): QuickItem =>
  quickItemsFor(category)[0] ?? { title: category, time: '', preset: categoryPreset(category) }

/** 模板補了東西的區塊，詳細頁據此展開讓使用者立刻看到。 */
export type TemplateSection = 'costs' | 'notes' | 'guide'

export interface TemplateResult {
  /** 只包含真的要補的欄位；沒東西可補時是空物件。 */
  patch: { costs?: CostLine[]; notes?: ItemNote[]; guide?: string }
  opened: TemplateSection[]
}

/**
 * 只補空欄位，永遠不覆蓋也不刪除既有內容 —— 換類型時舊資料原封不動。
 * 純函式，詳細頁改類型與列表快選共用同一套規則，差別只在傳進來的 preset。
 */
export const applyTemplate = (
  item: { costs: CostLine[]; notes: ItemNote[]; guide?: string },
  preset: Preset,
  trip: Pick<Trip, 'foreignCurrency'>,
): TemplateResult => {
  const patch: TemplateResult['patch'] = {}
  const opened: TemplateSection[] = []

  if (preset.cost && item.costs.length === 0) {
    patch.costs = [
      {
        id: newId(),
        label: preset.cost.label,
        unitPrice: 0,
        qty: 1,
        currency: trip.foreignCurrency,
      },
    ]
    opened.push('costs')
  }

  if (preset.notes.length && item.notes.length === 0) {
    patch.notes = preset.notes.map((note) => ({
      id: newId(),
      text: note.text,
      showInOverview: note.showInOverview,
    }))
    opened.push('notes')
  }

  if (preset.guide && !item.guide?.trim()) {
    patch.guide = preset.guide
    opened.push('guide')
  }

  return { patch, opened }
}
