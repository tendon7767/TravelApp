export const OWNERLESS = '未指定持有人'

/** 卡片在選單裡要標出是誰的，因為多人同行時常常持有同一張卡。 */
export const methodLabel = (name: string, owner?: string): string => {
  const base = name || '未命名'
  const who = owner?.trim()
  return who ? `${base}（${who}）` : base
}
