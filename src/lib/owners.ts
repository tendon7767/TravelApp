/** 持有人的代表色。用名字雜湊挑色，同一個人每次進來都是同一個顏色。 */
const PALETTE = ['#2f7fd4', '#c7538c', '#3f9142', '#d98324', '#7b62c9', '#0f9b9b']

export const ownerColor = (owner: string): string => {
  let hash = 0
  for (let i = 0; i < owner.length; i++) hash = (hash * 31 + owner.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

export const OWNERLESS = '未指定持有人'

/** 卡片在選單裡要標出是誰的，因為多人同行時常常持有同一張卡。 */
export const methodLabel = (name: string, owner?: string): string => {
  const base = name || '未命名'
  const who = owner?.trim()
  return who ? `${base}（${who}）` : base
}
