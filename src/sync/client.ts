import type { AppData } from '../types'
import type { PlaceInfo } from '../lib/placeInfo'
import { normalizeStoredDate, normalizeStoredTime } from '../lib/date'
import { normalizeItemNotes } from '../lib/itemNotes'
import { normalizeItemCostGroups } from '../lib/costGroups'

export interface SyncConfig {
  /** Apps Script 網頁應用程式網址，只部署一次，所有旅程共用 */
  gasUrl: string
}

export interface TripLink {
  sheetId: string
  secret: string
}

/** 這些集合會同步；settings 是各裝置自己的東西，不上傳。 */
export const SYNCED_COLLECTIONS = [
  'trips',
  'plans',
  'items',
  'reviews',
  'photos',
  'notes',
  'payments',
  'transports',
] as const

export type SyncedCollection = (typeof SYNCED_COLLECTIONS)[number]

/**
 * Apps Script 的網頁應用程式不處理 OPTIONS 預檢請求。
 * 只要用 text/plain 送出就屬於「簡單請求」，瀏覽器不會發預檢，回應也帶得回來。
 * 換成 application/json 會觸發預檢而整個失敗 —— 這是這裡唯一不能改的細節。
 */
const call = async <T>(
  gasUrl: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> => {
  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
    signal,
  })
  if (!res.ok) throw new Error(`伺服器回應 ${res.status}`)
  const data = (await res.json()) as T & { error?: string }
  if (data.error) throw new Error(data.error)
  return data
}

export const ping = (gasUrl: string) =>
  call<{
    ok: boolean
    version?: string
    capabilities?: {
      photos?: number
      invite?: number
      ai?: number
      costGroups?: number
      receiptAi?: number
    }
  }>(gasUrl, { action: 'ping' })

/**
 * 在試算表裡留一份邀請連結。本機資料被瀏覽器清掉時，試算表 ID 與密鑰會一起消失，
 * 那時能從雲端硬碟打開試算表看到連結，才有辦法把這趟加回來。
 */
export const saveRemoteInvite = (gasUrl: string, link: TripLink, inviteUrl: string) =>
  call<{ ok: boolean }>(gasUrl, {
    action: 'saveInvite',
    sheetId: link.sheetId,
    secret: link.secret,
    inviteUrl,
  })

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('無法讀取圖片'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(blob)
  })

export interface RemotePhotoUpload {
  id: string
  itemId: string
  kind: 'receipt' | 'trip'
  mimeType: 'image/jpeg'
  width: number
  height: number
  byteSize: number
  updatedAt: number
  updatedBy: string
  fullBlob: Blob
  thumbnailBlob: Blob
}

export const uploadRemotePhoto = async (
  gasUrl: string,
  link: TripLink,
  upload: RemotePhotoUpload,
) =>
  call<import('../types').Photo>(gasUrl, {
    action: 'uploadPhoto',
    sheetId: link.sheetId,
    secret: link.secret,
    photo: {
      id: upload.id,
      itemId: upload.itemId,
      kind: upload.kind,
      mimeType: upload.mimeType,
      width: upload.width,
      height: upload.height,
      byteSize: upload.byteSize,
      updatedAt: upload.updatedAt,
      updatedBy: upload.updatedBy,
      fullBase64: await blobToBase64(upload.fullBlob),
      thumbnailBase64: await blobToBase64(upload.thumbnailBlob),
    },
  })

export const createRemoteTrip = (
  gasUrl: string,
  name: string,
  secret: string,
  folderId?: string,
) =>
  call<{ sheetId: string; folderId: string }>(gasUrl, {
    action: 'create',
    name,
    secret,
    folderId,
  })

export const fetchFolderInfo = (gasUrl: string, folderId?: string) =>
  call<{ id: string; name: string; path: string }>(gasUrl, { action: 'folderInfo', folderId })

/**
 * 接受雲端硬碟資料夾網址或直接的 ID。
 * 網址長得像 https://drive.google.com/drive/folders/<id>?usp=sharing
 */
export const parseFolderId = (input: string): string => {
  const text = input.trim()
  if (!text) return ''
  return text.match(/\/folders\/([A-Za-z0-9_-]+)/)?.[1] ?? text.split(/[?#]/)[0]
}

export const pullRemote = (gasUrl: string, link: TripLink, since: number) =>
  call<{ now: number; records: Record<SyncedCollection, Record<string, unknown>[]> }>(gasUrl, {
    action: 'pull',
    sheetId: link.sheetId,
    secret: link.secret,
    since,
  })

export const pushRemote = (
  gasUrl: string,
  link: TripLink,
  records: Partial<Record<SyncedCollection, unknown[]>>,
) =>
  call<{ now: number; applied: number; rejected: number }>(gasUrl, {
    action: 'push',
    sheetId: link.sheetId,
    secret: link.secret,
    records,
  })

export const fetchLinkMetadata = (gasUrl: string, link: TripLink, url: string) =>
  call<{ url: string; label: string }>(gasUrl, {
    action: 'expandUrl',
    sheetId: link.sheetId,
    secret: link.secret,
    url,
  })

/**
 * 地點分析。prompt 從前端送上去，後端只負責轉發給 Gemini ——
 * 調 prompt 只要改 src/data/placePrompt.md 再 push，不必重新部署後端。
 */
export interface PlaceRequest {
  prompt: string
  input: string
  schema: unknown
  model: string
  tools: unknown[]
}

export const describePlace = (
  gasUrl: string,
  link: TripLink,
  request: PlaceRequest,
  signal?: AbortSignal,
) =>
  call<{ ok: boolean; place: PlaceInfo }>(
    gasUrl,
    { action: 'describePlace', sheetId: link.sheetId, secret: link.secret, ...request },
    signal,
  )

export interface ReceiptRequest {
  prompt: string
  input: string
  schema: unknown
  model: string
}

/** 圖片只放進這次請求，不進照片上傳佇列，也不寫入 Drive。 */
export const analyzeRemoteReceipt = async (
  gasUrl: string,
  link: TripLink,
  request: ReceiptRequest,
  image: Blob,
  signal?: AbortSignal,
) =>
  call<{ ok: boolean; receipt: unknown }>(
    gasUrl,
    {
      action: 'analyzeReceipt',
      sheetId: link.sheetId,
      secret: link.secret,
      ...request,
      image: { mimeType: 'image/jpeg', data: await blobToBase64(image) },
    },
    signal,
  )

export const newSecret = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

/** 邀請連結把後端網址、試算表、密鑰一次帶齊，同行者點開就設定完成。 */
export const buildInviteLink = (gasUrl: string, link: TripLink): string => {
  const params = new URLSearchParams({ u: gasUrl, s: link.sheetId, k: link.secret })
  return `${location.origin}${location.pathname}#/join?${params.toString()}`
}

/**
 * 邀請連結的反向操作。iOS 把網頁加到主畫面後是獨立的儲存空間，點連結又只會開
 * Safari，所以主畫面 App 裡沒有任何辦法「點連結加入」—— 只能讓使用者貼進來。
 * 整條網址或只有 `?` 之後那段都接受。
 */
export const parseInviteLink = (text: string): (SyncConfig & TripLink) | undefined => {
  const trimmed = text.trim()
  const mark = trimmed.indexOf('?')
  if (mark < 0) return undefined
  const params = new URLSearchParams(trimmed.slice(mark + 1))
  const gasUrl = params.get('u')?.trim() ?? ''
  const sheetId = params.get('s')?.trim() ?? ''
  const secret = params.get('k')?.trim() ?? ''
  if (!gasUrl || !sheetId || !secret) return undefined
  return { gasUrl, sheetId, secret }
}

export interface MergeResult {
  data: AppData
  applied: number
  /** 本機較新的修改被遠端蓋掉時記下來，讓介面能出聲而不是默默消失 */
  overwritten: { collection: SyncedCollection; id: string; by: string }[]
}

/**
 * Google Sheets may turn date/time-looking strings into Date cells. Older backend
 * deployments then serialize those cells as full ISO timestamps. Keep the client
 * tolerant of that format so an invite opened before the backend is upgraded does
 * not leave native date/time inputs with invalid values.
 */
const normalizeRemoteRow = (
  collection: SyncedCollection,
  row: Record<string, unknown>,
): Record<string, unknown> => {
  // 路由參數永遠是字串；Sheets 若把看似數字的 ID 回傳成 number，
  // React Router 的嚴格比對會找不到剛加入的旅程。
  const normalized: Record<string, unknown> = { ...row, id: String(row.id) }
  if (collection === 'trips') {
    return {
      ...normalized,
      startDate: normalizeStoredDate(row.startDate) ?? row.startDate,
      endDate: normalizeStoredDate(row.endDate) ?? row.endDate,
    }
  }
  if (collection === 'items') {
    delete normalized.paymentStatus
    delete normalized.chargeDate
    if (normalized.category === '娛樂') normalized.category = '活動'
    return normalizeItemCostGroups({
      ...normalized,
      date: normalizeStoredDate(row.date) ?? row.date,
      startTime: normalizeStoredTime(row.startTime) ?? row.startTime,
      notes: normalizeItemNotes(row.notes, String(row.id)),
    } as unknown as AppData['items'][number]) as unknown as Record<string, unknown>
  }
  return normalized
}

/**
 * 以記錄為單位「後寫入者勝」，比較 updatedAt。
 * 心得刻意做成獨立記錄，所以每則只有作者本人會寫，這裡永遠不會弄丟別人的內容。
 */
export const mergeRemote = (
  local: AppData,
  incoming: Partial<Record<SyncedCollection, Record<string, unknown>[]>>,
): MergeResult => {
  const data = { ...local }
  const overwritten: MergeResult['overwritten'] = []
  let applied = 0

  for (const name of SYNCED_COLLECTIONS) {
    const rows = incoming[name]
    if (!rows?.length) continue

    const list = [...(local[name] as unknown as Record<string, unknown>[])]
    const indexById = new Map(list.map((r, i) => [String(r.id), i]))

    for (const rawRow of rows) {
      let row = normalizeRemoteRow(name, rawRow)
      const id = String(row.id)
      const at = Number(row.updatedAt) || 0
      const idx = indexById.get(id)

      // 日期是行程的必要欄位。遠端格式若無法解析，保留本機值；新資料則拒絕套用，
      // 不能因為一次 pull 就把仍可用的本機行程變成空白或無法顯示。
      if (name === 'trips') {
        const valid = normalizeStoredDate(row.startDate) && normalizeStoredDate(row.endDate)
        if (!valid && idx === undefined) continue
        if (!valid && idx !== undefined) {
          const mine = list[idx]
          row = { ...row, startDate: mine.startDate, endDate: mine.endDate }
        }
      }
      if (name === 'items' && !normalizeStoredDate(row.date)) {
        if (idx === undefined) continue
        row = { ...row, date: list[idx].date }
      }

      if (idx === undefined) {
        list.push(row)
        indexById.set(id, list.length - 1)
        applied++
        continue
      }

      const mine = list[idx]
      const mineAt = Number(mine.updatedAt) || 0
      if (at <= mineAt) {
        // 一次性完整重拉時，遠端和本機常有相同 updatedAt。若只有本機日期已壞，
        // 僅修復日期欄，不能因時間戳相同就略過，也不能用舊遠端整筆蓋掉本機。
        if (name === 'trips') {
          const startDate = normalizeStoredDate(row.startDate)
          const endDate = normalizeStoredDate(row.endDate)
          const mineDatesValid = normalizeStoredDate(mine.startDate) && normalizeStoredDate(mine.endDate)
          if (!mineDatesValid && startDate && endDate) {
            list[idx] = { ...mine, startDate, endDate }
            applied++
          }
        } else if (name === 'items') {
          const date = normalizeStoredDate(row.date)
          if (!normalizeStoredDate(mine.date) && date) {
            list[idx] = { ...mine, date }
            applied++
          }
        }
        continue
      }

      if (JSON.stringify(mine) !== JSON.stringify(row)) {
        overwritten.push({ collection: name, id, by: String(row.updatedBy ?? '同行者') })
      }
      list[idx] = row
      applied++
    }

    ;(data as unknown as Record<string, unknown>)[name] = list
  }

  return { data, applied, overwritten }
}
