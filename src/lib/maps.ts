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
  /*
   * 只吃網址合法的那些 ASCII 字元，不是 \S+ ——
   * <input> 會把貼進來的換行整個吃掉（不是換成空白），分享出來的
   * 「網址換行地名換行地址」就會黏成一串，`\S+` 會把地名一起收進網址裡：
   * 連結指到不存在的短碼，標籤只剩地址。停在第一個非網址字元才切得開。
   */
  const url = text.match(/https?:\/\/[\w\-.~:/?#[\]@!$&'()*+,;=%]+/i)?.[0] ?? text
  const pasted = text
    .replace(url, '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  const parsed = parseLink(url)
  // 地圖連結拆不出地名時刻意留空，讓介面把游標送過去、直接打字就好；
  // 塞一個假標籤只會逼使用者先刪掉它。一般網站用網域當標籤已經夠看。
  const fallback = parsed.kind === 'map' ? '' : url

  return {
    id: newId(),
    url,
    kind: parsed.kind,
    label: pasted || parsed.label || fallback,
  }
}

/**
 * Google 短網址展開後的 /maps/place/ 那一段，有些地點是「地名 門牌 地區 郵遞區號 國名」
 * 全部串在一起，整串當標籤會接到行程名稱後面佔掉一整行。
 * 切在第一個「以數字開頭的詞」之前（門牌、郵遞區號都長這樣），切完是空的就整串保留 ——
 * 7-ELEVEN 這種本身以數字開頭的店名不能被吃掉。
 * 後面那截太短則不切：「星巴克 101門市」的 101 是店名的一部分，不是地址。
 */
export const placeNameOf = (label: string): string => {
  const text = label.replace(/\s+/g, ' ').trim()
  const cut = text.search(/\s\d/)
  if (cut <= 0 || text.length - cut < 7) return text
  return text.slice(0, cut).trim() || text
}
