import type { Trip } from '../types'

/** 新增與編輯旅程共用的欄位形狀；元件檔只放元件，這裡放型別與驗證。 */
export interface TripForm {
  name: string
  startDate: string
  endDate: string
  foreignCurrency: string
  rate: number
}

export const tripFormValid = (form: TripForm): boolean =>
  Boolean(form.name.trim()) && form.endDate >= form.startDate

/** 開編輯彈窗時的初值：只取表單管的那幾個欄位。 */
export const tripFormOf = (trip: Trip): TripForm => ({
  name: trip.name,
  startDate: trip.startDate,
  endDate: trip.endDate,
  foreignCurrency: trip.foreignCurrency,
  rate: trip.rate,
})
