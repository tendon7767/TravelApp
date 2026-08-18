import type { AppData } from '../types'

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
const call = async <T>(gasUrl: string, payload: Record<string, unknown>): Promise<T> => {
  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`伺服器回應 ${res.status}`)
  const data = (await res.json()) as T & { error?: string }
  if (data.error) throw new Error(data.error)
  return data
}

export const ping = (gasUrl: string) => call<{ ok: boolean }>(gasUrl, { action: 'ping' })

export const createRemoteTrip = (
  gasUrl: string,
  name: string,
  secret: string,
  folderId?: string,
) => call<{ sheetId: string }>(gasUrl, { action: 'create', name, secret, folderId })

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
  call<{ now: number; applied: number }>(gasUrl, {
    action: 'push',
    sheetId: link.sheetId,
    secret: link.secret,
    records,
  })

export const expandShortUrl = (gasUrl: string, url: string) =>
  call<{ url: string; label: string }>(gasUrl, { action: 'expandUrl', url })

export const newSecret = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

/** 邀請連結把後端網址、試算表、密鑰一次帶齊，同行者點開就設定完成。 */
export const buildInviteLink = (gasUrl: string, link: TripLink): string => {
  const params = new URLSearchParams({ u: gasUrl, s: link.sheetId, k: link.secret })
  return `${location.origin}${location.pathname}#/join?${params.toString()}`
}

export interface MergeResult {
  data: AppData
  applied: number
  /** 本機較新的修改被遠端蓋掉時記下來，讓介面能出聲而不是默默消失 */
  overwritten: { collection: SyncedCollection; id: string; by: string }[]
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

    for (const row of rows) {
      const id = String(row.id)
      const at = Number(row.updatedAt) || 0
      const idx = indexById.get(id)

      if (idx === undefined) {
        list.push(row)
        indexById.set(id, list.length - 1)
        applied++
        continue
      }

      const mine = list[idx]
      const mineAt = Number(mine.updatedAt) || 0
      if (at <= mineAt) continue

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
