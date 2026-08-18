import type { ItemNote } from '../types'

/** 舊資料的備註是 string[]；載入與同步時轉成新格式，既有文字不能遺失。 */
export const normalizeItemNotes = (value: unknown, itemId: string): ItemNote[] => {
  if (!Array.isArray(value)) return []

  return value.map((note, index) => {
    const fallbackId = `${itemId}-note-${index}`
    if (typeof note === 'string') return { id: fallbackId, text: note }
    if (!note || typeof note !== 'object') return { id: fallbackId, text: String(note ?? '') }

    const row = note as Record<string, unknown>
    return {
      id: row.id ? String(row.id) : fallbackId,
      text: String(row.text ?? ''),
      showInOverview: row.showInOverview === true || undefined,
    }
  })
}
