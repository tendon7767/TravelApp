import { get, set } from 'idb-keyval'
import { emptyData, type AppData, type Review } from '../types'
import { normalizeStoredDate, normalizeStoredTime } from '../lib/date'

const DATA_KEY = 'travelapp:data'
const SETTINGS_KEY = 'travelapp:settings'

export interface Settings {
  /** 用於 updatedBy，M4 多人同步時分辨是誰改的。不做登入。 */
  memberName: string
  activeTripId?: string
  activePlanId?: string
  /** 打包清單範本，新旅程會自動帶入。存的是品項名稱。 */
  packingTemplate?: string[]
  /** Apps Script 網頁應用程式網址，只部署一次，所有旅程共用 */
  gasUrl?: string
  /** 所有旅程資料夾的共同上層。留空則用根目錄的「旅遊資料」。 */
  driveFolderId?: string
  /** 每趟旅程對應的試算表與密鑰。這是本機設定，不會同步。 */
  tripLinks?: Record<string, TripLinkState>
  /** 資料格式修復版本；升版時可讓既有裝置安全地完整重拉一次。 */
  syncRepairVersion?: number
}

export interface TripLinkState {
  sheetId: string
  /** 這趟在雲端硬碟的專屬資料夾，之後照片、匯出檔也放這裡 */
  folderId?: string
  secret: string
  /** 伺服器時間，用來做增量拉取，不受各裝置時鐘誤差影響 */
  lastSyncAt: number
  /** 本機時間，用來判斷哪些記錄改過還沒推上去 */
  lastPushedAt: number
}

export const DEFAULT_PACKING = [
  '護照',
  '國際駕照與台灣駕照',
  '信用卡',
  '外幣現金',
  '手機充電器與行動電源',
  '轉接頭',
  '常備藥',
  '行李秤',
  '雨具',
  '盥洗用品',
]

export const defaultSettings = (): Settings => ({ memberName: '我' })

/** 付款狀態的用詞改過兩次，載入時一併轉換，不讓新舊詞彙並存。 */
const LEGACY_STATUS: Record<string, string> = {
  未付: '尚未付款',
  現場付: '尚未付款',
  已刷卡: '已付款',
}

type LegacyItem = { id: string; review?: string; paymentStatus?: string }

export const loadData = async (): Promise<AppData> => {
  const raw = await get<AppData>(DATA_KEY)
  if (!raw) return emptyData()

  // 心得原本是項目裡的欄位，改成獨立記錄後把舊資料搬過去，不要靜默丟掉。
  const migratedReviews: Review[] = []
  for (const i of (raw.items ?? []) as unknown as LegacyItem[]) {
    if (!i.review?.trim()) continue
    migratedReviews.push({
      id: `${i.id}-legacy-review`,
      itemId: i.id,
      author: '我',
      text: i.review,
      updatedAt: Date.now(),
      updatedBy: '我',
    })
  }

  // 逐個給預設值，舊版存下來的資料少了新集合時才不會炸掉。
  return {
    // iOS Safari 對 date input 的 value 格式較嚴格；啟動時也要清理 IndexedDB 裡
    // 舊後端曾存下的完整 ISO timestamp，不能只在下一次遠端拉取時修正。
    trips: (raw.trips ?? []).map((trip) => ({
      ...trip,
      startDate: normalizeStoredDate(trip.startDate) ?? trip.startDate,
      endDate: normalizeStoredDate(trip.endDate) ?? trip.endDate,
    })),
    plans: raw.plans ?? [],
    items: (raw.items ?? []).map((i) => ({
      ...i,
      date: normalizeStoredDate(i.date) ?? i.date,
      startTime: normalizeStoredTime(i.startTime) ?? i.startTime,
      chargeDate: normalizeStoredDate(i.chargeDate) ?? i.chargeDate,
      ...(i.paymentStatus && LEGACY_STATUS[i.paymentStatus]
        ? { paymentStatus: LEGACY_STATUS[i.paymentStatus] as typeof i.paymentStatus }
        : {}),
    })),
    reviews: [...(raw.reviews ?? []), ...migratedReviews],
    notes: raw.notes ?? [],
    payments: raw.payments ?? [],
    transports: raw.transports ?? [],
  }
}

export const saveData = (data: AppData): Promise<void> => set(DATA_KEY, data)

export const loadSettings = async (): Promise<Settings> => {
  const settings = {
    ...defaultSettings(),
    ...((await get<Settings>(SETTINGS_KEY)) ?? {}),
  }

  // v1 修復 pull 日期型別：只把增量拉取游標歸零一次，保留本機資料與推送游標。
  // 下一次進旅程會取得完整遠端快照，讓 merge 修回已經損壞的本機日期。
  if ((settings.syncRepairVersion ?? 0) < 1) {
    settings.tripLinks = Object.fromEntries(
      Object.entries(settings.tripLinks ?? {}).map(([tripId, link]) => [
        tripId,
        { ...link, lastSyncAt: 0 },
      ]),
    )
    settings.syncRepairVersion = 1
    await set(SETTINGS_KEY, settings)
  }

  return settings
}

export const saveSettings = (s: Settings): Promise<void> => set(SETTINGS_KEY, s)
