import { get, set } from 'idb-keyval'
import { emptyData, type AppData } from '../types'

const DATA_KEY = 'travelapp:data'
const SETTINGS_KEY = 'travelapp:settings'

export interface Settings {
  /** 用於 updatedBy，M4 多人同步時分辨是誰改的。不做登入。 */
  memberName: string
  activeTripId?: string
  activePlanId?: string
}

export const defaultSettings = (): Settings => ({ memberName: '我' })

export const loadData = async (): Promise<AppData> => {
  const raw = await get<AppData>(DATA_KEY)
  if (!raw) return emptyData()
  return { trips: raw.trips ?? [], plans: raw.plans ?? [], items: raw.items ?? [] }
}

export const saveData = (data: AppData): Promise<void> => set(DATA_KEY, data)

export const loadSettings = async (): Promise<Settings> => ({
  ...defaultSettings(),
  ...((await get<Settings>(SETTINGS_KEY)) ?? {}),
})

export const saveSettings = (s: Settings): Promise<void> => set(SETTINGS_KEY, s)
