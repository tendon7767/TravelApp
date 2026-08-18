import type { LinkRef } from '../types'
import { newId } from './id'

export interface ParsedLink {
  kind: LinkRef['kind']
  label: string
  /** 短網址在本地拆不出地名，要連線讓後端展開（M4）。在那之前使用者可自行輸入標籤。 */
  needsExpand: boolean
}

const SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl']

const isMapsUrl = (u: URL): boolean =>
  SHORT_HOSTS.includes(u.hostname) ||
  (u.hostname.includes('google.') && u.pathname.startsWith('/maps')) ||
  u.hostname === 'maps.google.com'

const prettify = (raw: string): string => {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).trim()
  } catch {
    return raw.replace(/\+/g, ' ').trim()
  }
}

/**
 * 貼上網址就解析出標籤，不用手打地點名稱。
 * 完整的 /maps/place/<地名>/ 網址可以離線拆解，這是最常見的複製來源。
 */
export const parseLink = (url: string): ParsedLink => {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return { kind: 'web', label: url.trim(), needsExpand: false }
  }

  if (!isMapsUrl(u)) {
    return { kind: 'web', label: u.hostname.replace(/^www\./, ''), needsExpand: false }
  }

  if (SHORT_HOSTS.includes(u.hostname)) {
    return { kind: 'map', label: '', needsExpand: true }
  }

  const place = u.pathname.match(/\/maps\/place\/([^/@]+)/)
  if (place?.[1]) return { kind: 'map', label: prettify(place[1]), needsExpand: false }

  const q = u.searchParams.get('query') || u.searchParams.get('q')
  if (q) return { kind: 'map', label: prettify(q), needsExpand: false }

  return { kind: 'map', label: '', needsExpand: true }
}

/**
 * 短網址（maps.app.goo.gl）的地名藏在重新導向之後，瀏覽器跨網域讀不到，
 * 所以退而求其次：
 *   1. 從 Google 地圖「分享」貼出來的內容通常是「地點名稱換行網址」，名稱直接拿來用
 *   2. 完整的 /maps/place/ 網址本地就能拆出地名
 *   3. 都不行就給一個看得懂的預設標籤，讓使用者自己改
 */
export const makeLink = (input: string): LinkRef => {
  const text = input.trim()
  const url = text.match(/https?:\/\/\S+/)?.[0] ?? text
  const pasted = text
    .replace(url, '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  const parsed = parseLink(url)
  const fallback = parsed.kind === 'map' ? 'Google 地圖' : url

  return {
    id: newId(),
    url,
    kind: parsed.kind,
    label: pasted || parsed.label || fallback,
  }
}
