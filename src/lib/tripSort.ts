import type { Trip } from '../types'
import { todayISO } from './date'

export type TripSort = 'smart' | 'dateDesc' | 'dateAsc'

export const DEFAULT_TRIP_SORT: TripSort = 'smart'

/** 排序鍵上顯示的短名，與 picker 裡的選項共用同一份定義。 */
export const TRIP_SORTS: { key: TripSort; label: string; hint: string }[] = [
  { key: 'smart', label: '日期', hint: '進行中的排最前，接著是即將出發，已結束的在最後' },
  { key: 'dateDesc', label: '新→舊', hint: '出發日越近越前面，不分進行中' },
  { key: 'dateAsc', label: '舊→新', hint: '出發日由早到晚，整趟排成一條時間軸' },
]

export const tripSortLabel = (sort: TripSort | undefined): string =>
  TRIP_SORTS.find((s) => s.key === (sort ?? DEFAULT_TRIP_SORT))?.label ?? '日期'

/** smart 專用：0 進行中、1 未來、2 過去。日期不全的在外面就先濾掉了。 */
const rank = (trip: Trip, today: string): number => {
  if (trip.endDate < today) return 2
  if (trip.startDate > today) return 1
  return 0
}

/**
 * 排序是「算出來的」，不存任何東西：不進資料、不進同步、不必遷移。
 * 日期是 YYYY-MM-DD，字串比大小就等於比日期。
 *
 * 三種排序共用兩條規則：日期不全的一律沉到最後（維持原本的相對順序），
 * 其餘一律用索引當最後的 tiebreak，免得同日期的兩趟每次重繪換位置。
 */
export const sortTrips = (
  trips: Trip[],
  sort: TripSort = DEFAULT_TRIP_SORT,
  today: string = todayISO(),
): Trip[] =>
  trips
    .map((trip, index) => ({ trip, index }))
    .sort((a, b) => {
      const undatedA = !a.trip.startDate || !a.trip.endDate
      const undatedB = !b.trip.startDate || !b.trip.endDate
      if (undatedA !== undatedB) return undatedA ? 1 : -1
      if (undatedA) return a.index - b.index

      if (sort === 'dateAsc') {
        return a.trip.startDate.localeCompare(b.trip.startDate) || a.index - b.index
      }
      if (sort === 'dateDesc') {
        return b.trip.startDate.localeCompare(a.trip.startDate) || a.index - b.index
      }

      const ra = rank(a.trip, today)
      const rb = rank(b.trip, today)
      if (ra !== rb) return ra - rb
      // 過去的看結束日、越新越前面；進行中與未來都是出發日越近越前面。
      const byDate =
        ra === 2
          ? b.trip.endDate.localeCompare(a.trip.endDate)
          : a.trip.startDate.localeCompare(b.trip.startDate)
      return byDate || a.index - b.index
    })
    .map(({ trip }) => trip)

/**
 * 分隔線：畫在排好的列表裡「現在」該落的位置，文字講的是線以下那一截的狀態。
 * 日期與新→舊的下面是已結束，舊→新的下面是未開始。
 *
 * 判斷是「從這一趟起、往下每一趟都符合」，不是找第一個符合的 ——
 * 日期重疊時（長旅程裡套一趟短的）兩種狀態可能交錯，線以下只要混進一趟不符合的，
 * 那行字就是錯的。新→舊下面若有進行中的那趟，它會留在線上面，原因相同。
 * 日期不全的一律沉在最底、哪一種都不算，不參與判斷。兩側任一邊是空的就不畫。
 */
export const tripDivider = (
  sorted: Trip[],
  sort: TripSort,
  today: string,
): { beforeId: string; label: string } | undefined => {
  const dated = sorted.filter((trip) => trip.startDate && trip.endDate)
  const below =
    sort === 'dateAsc'
      ? (trip: Trip) => trip.startDate > today
      : (trip: Trip) => trip.endDate < today
  let start = dated.length
  while (start > 0 && below(dated[start - 1])) start--
  if (start === 0 || start === dated.length) return undefined
  return { beforeId: dated[start].id, label: sort === 'dateAsc' ? '未開始' : '已結束' }
}
