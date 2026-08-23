/**
 * /placesAI 的搬運層。這支腳本沒有任何「智慧」——查資料是 Claude Code 那邊做的事，
 * 這裡只負責把行程拉下來、把結果寫回去。
 *
 * 之所以是 TypeScript 而不是一支獨立的小工具：組文字用的是 App 自己的
 * formatPlaceInfo / mergeGuide / appendCautions。同一套函式意味著兩條路
 * （App 裡的 ✨ 按鈕、這裡的批次）產出的區塊格式不可能長歪，
 * 之後在 App 裡重新分析同一筆也還是會乾淨地整塊換掉。
 *
 *   npx tsx scripts/places.ts list  <旅程代號>
 *   npx tsx scripts/places.ts write <旅程代號> < payload.json
 *
 * 設定放在 ~/.travelapp/trips.json，**故意放在 repo 外面**：
 * 邀請連結就是通行證，而 .claude/ 是進 git 的，放進去遲早會被 commit 掉。
 *
 *   { "東京": { "gasUrl": "https://...", "sheetId": "...", "secret": "..." } }
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Item } from '../src/types'
import {
  appendCautions,
  formatPlaceInfo,
  mergeGuide,
  AI_BLOCK_MARK,
  type PlaceInfo,
} from '../src/lib/placeInfo'

const CONFIG = join(homedir(), '.travelapp', 'trips.json')

interface TripConfig {
  gasUrl: string
  sheetId: string
  secret: string
}

const die = (message: string): never => {
  console.error(message)
  process.exit(1)
}

const loadTrip = (key: string): TripConfig => {
  let raw: string
  try {
    raw = readFileSync(CONFIG, 'utf8')
  } catch {
    return die(`找不到 ${CONFIG}。格式：{ "旅程代號": { "gasUrl": "...", "sheetId": "...", "secret": "..." } }`)
  }
  const all = JSON.parse(raw) as Record<string, TripConfig>
  const trip = all[key]
  if (!trip) return die(`${CONFIG} 裡沒有「${key}」。現有的：${Object.keys(all).join('、') || '（空的）'}`)
  return trip
}

/**
 * Apps Script 的網頁應用程式不處理 OPTIONS 預檢，所以一律用 text/plain 送。
 * 這條跟 src/sync/client.ts 的 `call` 是同一條規則（見 CLAUDE.md）——
 * 那邊沒辦法直接重用，因為它所在的模組帶著 DOM 相依，在 Node 底下型別過不了。
 */
const callBackend = async <T>(gasUrl: string, payload: Record<string, unknown>): Promise<T> => {
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

const pullItems = async (trip: TripConfig): Promise<Item[]> => {
  const { records } = await callBackend<{ records: Record<string, Item[]> }>(trip.gasUrl, {
    action: 'pull',
    sheetId: trip.sheetId,
    secret: trip.secret,
    since: 0,
  })
  return (records.items ?? []).filter((item) => !item.deleted)
}

const hasMapLink = (item: Item) =>
  (item.links ?? []).some((link) => link.kind === 'map' && link.url.trim())

const hasAiBlock = (item: Item) =>
  (item.guide ?? '').split('\n').some((line) => line.trim() === AI_BLOCK_MARK)

/**
 * 候選清單輸出成 JSON 而不是漂亮的表格：讀它的是 Claude Code，
 * 給人看的編號與排版由對話那端算繪，篩選條件才不必寫死在腳本裡。
 */
const list = async (trip: TripConfig) => {
  const items = await pullItems(trip)
  const rows = items
    .map((item) => ({
      id: item.id,
      date: item.date,
      time: item.startTime ?? '',
      title: item.title,
      category: item.category ?? '',
      hasMap: hasMapLink(item),
      hasAi: hasAiBlock(item),
      mapUrl: (item.links ?? []).find((link) => link.kind === 'map')?.url ?? '',
      guide: item.guide ?? '',
      notes: (item.notes ?? []).map((note) => note.text),
    }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  console.log(JSON.stringify(rows, null, 2))
}

/**
 * 寫回去。刻意只碰 guide 與 notes，其餘欄位原樣帶回 ——
 * 這是直接寫進同步層，繞過了 App 自己的寫入邏輯，動到的欄位愈少愈好。
 * 寫之前重新 pull 一次，不要拿 list 當時的舊快照覆蓋掉這中間的編輯。
 */
const write = async (trip: TripConfig, payload: { id: string; place: PlaceInfo }[]) => {
  const items = await pullItems(trip)
  const byId = new Map(items.map((item) => [item.id, item]))
  const now = Date.now()
  const records: Item[] = []

  for (const entry of payload) {
    const item = byId.get(entry.id)
    if (!item) {
      console.error(`跳過 ${entry.id}：這筆已經不在了`)
      continue
    }
    records.push({
      ...item,
      guide: mergeGuide(item.guide, formatPlaceInfo(entry.place)),
      notes: appendCautions(item.notes ?? [], entry.place.cautions ?? []),
      // 後端會拒絕 updatedAt 比現有列舊的記錄，所以這裡一定要往前推。
      updatedAt: now,
      updatedBy: 'AI 查詢',
    })
  }

  if (!records.length) return die('沒有可以寫的記錄。')

  const result = await callBackend<{ applied: number; rejected: number }>(trip.gasUrl, {
    action: 'push',
    sheetId: trip.sheetId,
    secret: trip.secret,
    records: { items: records },
  })
  console.log(`寫入 ${result.applied} 筆，被拒 ${result.rejected} 筆。`)
}

const [command, tripKey] = process.argv.slice(2)
if (!command || !tripKey) die('用法：places.ts list|write <旅程代號>')
const trip = loadTrip(tripKey)

if (command === 'list') {
  await list(trip)
} else if (command === 'write') {
  const stdin = readFileSync(0, 'utf8')
  await write(trip, JSON.parse(stdin) as { id: string; place: PlaceInfo }[])
} else {
  die(`不認得的指令：${command}`)
}
