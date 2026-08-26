import type { CostGroup, Item, ItemCostLine } from '../types'
import { newId } from './id'

/**
 * 舊版費用沒有群組。ID 由 item id 固定推導，不用 newId()，不同裝置各自載入舊資料時
 * 才不會產生兩個不同群組，之後同步又反覆互蓋。
 */
const legacyGroupId = (itemId: string) => `${itemId}-legacy-cost-group`

/** 補齊舊資料與舊後端拉回來的費用群組，並保留已存在的群組順序。 */
export const normalizeItemCostGroups = (value: Item): Item => {
  const raw = value as Item & { costGroups?: CostGroup[]; costs?: ItemCostLine[] }
  const costs = Array.isArray(raw.costs) ? raw.costs : []
  const groups = Array.isArray(raw.costGroups) ? raw.costGroups.map((group) => ({ ...group })) : []
  const known = new Set(groups.map((group) => group.id))
  const legacyId = legacyGroupId(String(value.id))
  const normalizedCosts = costs.map((cost) => {
    const groupId = typeof cost.groupId === 'string' && cost.groupId ? cost.groupId : legacyId
    if (!known.has(groupId)) {
      groups.push({
        id: groupId,
        ...(groupId === legacyId && value.paymentMethodId
          ? { paymentMethodId: value.paymentMethodId }
          : {}),
      })
      known.add(groupId)
    }
    return { ...cost, groupId }
  })

  // 沒有費用時不憑空建立空群組；點進費用編輯才建立第一張草稿卡。
  return { ...value, costs: normalizedCosts, costGroups: groups }
}

/** 儲存前移除空費用，以及沒有任何費用的空群組。 */
export const cleanItemCosts = (
  costs: ItemCostLine[],
  groups: CostGroup[],
  isBlank: (cost: ItemCostLine) => boolean,
): Pick<Item, 'costs' | 'costGroups'> => {
  const filled = costs.filter((cost) => !isBlank(cost))
  const used = new Set(filled.map((cost) => cost.groupId))
  return {
    costs: filled,
    costGroups: groups.filter((group) => used.has(group.id)),
  }
}

/** 複製行程時群組與費用都要換 id，且費用要指向複本裡的新群組。 */
export const duplicateItemCosts = (
  costs: ItemCostLine[],
  groups: CostGroup[],
): Pick<Item, 'costs' | 'costGroups'> => {
  const ids = new Map(groups.map((group) => [group.id, newId()]))
  return {
    costGroups: groups.map((group) => ({ ...group, id: ids.get(group.id)! })),
    costs: costs.map((cost) => ({
      ...cost,
      id: newId(),
      groupId: ids.get(cost.groupId) ?? cost.groupId,
    })),
  }
}
