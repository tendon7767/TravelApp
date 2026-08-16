import type { KeyboardEvent } from 'react'

/**
 * 中文、日文輸入法在選字階段按 Enter 是「確認選字」，不是「送出」。
 * 沒擋掉的話打注音按 Enter 會直接把半成品送出去。
 * keyCode 229 是舊版 Safari 沒有 isComposing 時的後備判斷。
 */
export const isSubmitEnter = (e: KeyboardEvent): boolean =>
  e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229
