import presets from '../data/itineraryPresets.json'
import type { CostLine, ItemNote, ItineraryCategory, Trip } from '../types'
import { newId } from './id'

/**
 * 行程類型的預設值全部集中在 src/data/itineraryPresets.json，讓它可以直接手改。
 * 這裡只負責把那份資料接上型別與套用規則。
 */
interface CategoryPreset {
  預設費用?: { 項目: string; 單位?: string }
  預設備註?: string[]
  快選?: { 標題: string; 時間: string }[]
}

const CATEGORY_PRESETS = presets.類型 as Partial<Record<ItineraryCategory, CategoryPreset>>

export interface QuickItem {
  title: string
  /** 這個項目最常見的時段。當天已經有項目佔用就會自動往後排。 */
  time: string
}

export const quickItemsFor = (category: ItineraryCategory): QuickItem[] =>
  (CATEGORY_PRESETS[category]?.快選 ?? []).map((row) => ({ title: row.標題, time: row.時間 }))

/** 子項少於兩個就不值得多跳一層選單，點類型直接建立。 */
export const needsSecondLevel = (category: ItineraryCategory): boolean =>
  quickItemsFor(category).length > 1

/** 沒設快選的類型就用類型名當標題，不讓任何一格點下去沒反應。 */
export const soleQuickItem = (category: ItineraryCategory): QuickItem =>
  quickItemsFor(category)[0] ?? { title: category, time: '' }

/** 模板補了東西的區塊，詳細頁據此展開讓使用者立刻看到。 */
export type TemplateSection = 'costs' | 'notes'

export interface TemplateResult {
  /** 只包含真的要補的欄位；沒東西可補時是空物件。 */
  patch: { costs?: CostLine[]; notes?: ItemNote[] }
  opened: TemplateSection[]
}

/**
 * 只補空欄位，永遠不覆蓋也不刪除既有內容 —— 換類型時舊資料原封不動。
 * 純函式，詳細頁改類型與列表快選共用同一套規則。
 */
export const applyCategoryTemplate = (
  item: { costs: CostLine[]; notes: ItemNote[] },
  category: ItineraryCategory | undefined,
  trip: Pick<Trip, 'foreignCurrency'>,
): TemplateResult => {
  const preset = category ? CATEGORY_PRESETS[category] : undefined
  const patch: TemplateResult['patch'] = {}
  const opened: TemplateSection[] = []
  if (!preset) return { patch, opened }

  const cost = preset.預設費用
  if (cost?.項目 && item.costs.length === 0) {
    patch.costs = [
      {
        id: newId(),
        label: cost.項目,
        unitPrice: 0,
        qty: 1,
        unit: cost.單位 || undefined,
        currency: trip.foreignCurrency,
      },
    ]
    opened.push('costs')
  }

  const notes = preset.預設備註 ?? []
  if (notes.length && item.notes.length === 0) {
    patch.notes = notes.map((text) => ({ id: newId(), text }))
    opened.push('notes')
  }

  return { patch, opened }
}
