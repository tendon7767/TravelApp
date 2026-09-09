/**
 * 一次性的批次匯入頁（import.html）。
 *
 * 為什麼存在：把一整批查好的店家寫進某一趟的試算表時，手邊只有手機、
 * 跑不了 scripts/places.ts。這一頁做的事跟那支腳本一樣 —— pull、組記錄、push ——
 * 差別只在它跑在瀏覽器裡，一顆按鈕就完成。
 *
 * 密鑰不寫在這裡：由使用者當場貼上邀請連結，只留在這個分頁的記憶體裡。
 *
 * 排版一律走 formatPlaceInfo / mergeGuide / appendCautions，跟 App 的 ✨ 同一套，
 * 所以之後在 App 裡重新分析同一筆，AI 區塊還是會被乾淨地整塊換掉。
 */
import {
  appendCautions,
  formatPlaceInfo,
  mergeGuide,
} from '../lib/placeInfo'
import { YUFUIN_SHOPS, type ShopSeed } from './yufuinShops'
import type { Item, Plan } from '../types'

interface Conn {
  gasUrl: string
  sheetId: string
  secret: string
}

const $ = (id: string) => document.getElementById(id) as HTMLElement

const say = (text: string, tone: 'ok' | 'err' | '' = '') => {
  const box = $('log')
  const line = document.createElement('div')
  line.className = `line ${tone}`
  line.textContent = text
  box.appendChild(line)
  box.scrollTop = box.scrollHeight
}

/** 邀請連結：#/join?u=<後端網址>&s=<試算表 ID>&k=<密鑰> */
const parseInvite = (raw: string): Conn => {
  const text = raw.trim()
  if (!text) throw new Error('請先貼上邀請連結')
  const query = text.slice(text.indexOf('?') + 1)
  const params = new URLSearchParams(query.split('#').pop() ?? query)
  const gasUrl = params.get('u') ?? ''
  const sheetId = params.get('s') ?? ''
  const secret = params.get('k') ?? ''
  if (!gasUrl || !sheetId || !secret) throw new Error('這段連結裡找不到 u / s / k，確認整段都貼進來了')
  return { gasUrl, sheetId, secret }
}

/**
 * Apps Script 的 Web App 不處理 OPTIONS 預檢，只有「簡單請求」拿得回回應，
 * 所以一律 text/plain。換成 application/json 整條會壞掉（見 CLAUDE.md）。
 */
const call = async <T>(conn: Conn, payload: Record<string, unknown>): Promise<T> => {
  const res = await fetch(conn.gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, sheetId: conn.sheetId, secret: conn.secret }),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`伺服器回應 ${res.status}`)
  const data = (await res.json()) as T & { error?: string }
  if (data.error) throw new Error(String(data.error))
  return data
}

const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** 這一批要寫的東西：既有那筆就地更新，其餘新增。 */
interface Planned {
  seed: ShopSeed
  existing?: Item
  record: Item
}

const planWrites = (seeds: ShopSeed[], items: Item[], planId: string, author: string): Planned[] => {
  const now = Date.now()
  return seeds.map((seed) => {
    const wanted = seed.matchTitle ?? seed.title
    // 同一版、同一天、標題一字不差＝就是這一筆。重跑不會建出第二筆。
    const existing = items.find(
      (item) =>
        !item.deleted &&
        item.planId === planId &&
        item.date === seed.date &&
        item.title.trim() === wanted.trim(),
    )
    const block = formatPlaceInfo(seed.place)
    const base: Item = existing ?? {
      id: newId(),
      planId,
      date: seed.date,
      startTime: seed.startTime,
      title: seed.title,
      notes: [],
      links: [],
      costs: [],
      costGroups: [],
      category: seed.category,
      updatedAt: now,
      updatedBy: author,
    }
    const links = existing
      ? base.links
      : seed.webUrl
        ? [{ id: newId(), kind: 'web' as const, label: seed.webLabel ?? '官方網站', url: seed.webUrl }]
        : []
    return {
      seed,
      existing,
      record: {
        ...base,
        links,
        guide: mergeGuide(base.guide, block),
        notes: appendCautions(base.notes ?? [], seed.place.cautions ?? []),
        updatedAt: now,
        updatedBy: author,
      },
    }
  })
}

let conn: Conn | null = null
let plans: Plan[] = []
let items: Item[] = []
let planned: Planned[] = []

const renderPreview = () => {
  const planId = ($('plan') as HTMLSelectElement).value
  const author = ($('author') as HTMLInputElement).value.trim() || 'AI 查詢'
  planned = planWrites(YUFUIN_SHOPS, items, planId, author)
  const list = $('preview')
  list.innerHTML = ''
  for (const entry of planned) {
    const row = document.createElement('div')
    row.className = 'row'
    const when = entry.record.startTime ? `${entry.record.startTime} ` : ''
    row.innerHTML = `<span class="tag ${entry.existing ? 'upd' : 'new'}">${
      entry.existing ? '更新' : '新增'
    }</span><span>${when}${entry.record.title}</span>`
    list.appendChild(row)
  }
  const news = planned.filter((entry) => !entry.existing).length
  $('summary').textContent = `共 ${planned.length} 筆：新增 ${news}、更新 ${planned.length - news}`
  $('step2').hidden = false
}

$('load').addEventListener('click', async () => {
  const button = $('load') as HTMLButtonElement
  button.disabled = true
  try {
    conn = parseInvite(($('invite') as HTMLTextAreaElement).value)
    say('連線中…')
    const ping = await call<{ version: string }>(conn, { action: 'ping' })
    say(`後端版本 ${ping.version}`, 'ok')
    const pulled = await call<{ records: { plans: Plan[]; items: Item[] } }>(conn, {
      action: 'pull',
      since: 0,
    })
    plans = (pulled.records.plans ?? []).filter((plan) => !plan.deleted)
    items = (pulled.records.items ?? []).filter((item) => !item.deleted)
    say(`拉到 ${plans.length} 個版本、${items.length} 筆行程`, 'ok')

    const select = $('plan') as HTMLSelectElement
    select.innerHTML = ''
    for (const plan of plans) {
      const option = document.createElement('option')
      option.value = plan.id
      option.textContent = `${plan.name}（${plan.kind === 'actual' ? '實際版' : '規劃版'}）`
      if (plan.kind === 'actual') option.selected = true
      select.appendChild(option)
    }
    renderPreview()
  } catch (err) {
    say(String(err instanceof Error ? err.message : err), 'err')
  } finally {
    button.disabled = false
  }
})

$('plan').addEventListener('change', renderPreview)
$('author').addEventListener('input', renderPreview)

$('write').addEventListener('click', async () => {
  if (!conn || !planned.length) return
  const button = $('write') as HTMLButtonElement
  button.disabled = true
  try {
    say('寫入中…')
    const result = await call<{ applied: number; rejected: number }>(conn, {
      action: 'push',
      records: { items: planned.map((entry) => entry.record) },
    })
    say(`完成：寫入 ${result.applied} 筆，被拒 ${result.rejected} 筆`, 'ok')
    if (result.rejected) say('被拒表示雲端那筆比較新，回 App 同步一次後再跑一次即可', '')
    say('回 App 拉一次同步就看得到了', 'ok')
  } catch (err) {
    say(String(err instanceof Error ? err.message : err), 'err')
  } finally {
    button.disabled = false
  }
})
