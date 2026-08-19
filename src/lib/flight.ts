/**
 * 航班號放在標題最後（例如「飛機 台北→東京 JL812」），所以只認結尾。
 * 兩碼航空公司代碼可以含一個數字（3K、7C、H1），後面接 3~4 位數字。
 */
const FLIGHT_TAIL = /(?:^|[\s\-–—－·、])(?:[A-Za-z]{2}|[A-Za-z]\d|\d[A-Za-z])[\s-]?\d{3,4}\s*$/

/** 快選建出來的標題就是「飛機」，使用者接著在後面補班號。 */
const PLANE_WORD = '飛機'

/** 標題同時提到飛機、又帶著航班號，才值得跳出去查動態。 */
export const hasFlightStatus = (title: string): boolean =>
  title.includes(PLANE_WORD) && FLIGHT_TAIL.test(title)

/** 直接把整個標題丟去 Google，比自己拆班號可靠。 */
export const flightStatusUrl = (title: string): string =>
  `https://www.google.com/search?q=${encodeURIComponent(`${title.trim()} 航班動態`)}`
