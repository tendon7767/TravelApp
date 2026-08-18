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

/** 「未付」與「現場付」原本是兩個選項，實際上是同一件事，載入時合併。 */
const LEGACY_STATUS: Record<string, string> = { 未付: '尚未付款', 現場付: '尚未付款' }

export const loadData = async (): Promise<AppData> => {
  const raw = await get<AppData>(DATA_KEY)
  if (!raw) return emptyData()
  // 逐個給預設值，舊版存下來的資料少了新集合時才不會炸掉。
  return {
    trips: raw.trips ?? [],
    plans: raw.plans ?? [],
    items: (raw.items ?? []).map((i) =>
      i.paymentStatus && LEGACY_STATUS[i.paymentStatus]
        ? { ...i, paymentStatus: LEGACY_STATUS[i.paymentStatus] as typeof i.paymentStatus }
        : i,
    ),
    payments: raw.payments ?? [],
    transports: raw.transports ?? [],
  }
}

export const saveData = (data: AppData): Promise<void> => set(DATA_KEY, data)

export const loadSettings = async (): Promise<Settings> => ({
  ...defaultSettings(),
  ...((await get<Settings>(SETTINGS_KEY)) ?? {}),
})

export const saveSettings = (s: Settings): Promise<void> => set(SETTINGS_KEY, s)
