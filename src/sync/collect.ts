import type { AppData } from '../types'
import { normalizeStoredDate, normalizeStoredTime } from '../lib/date'
import type { SyncedCollection } from './client'

/** 一趟旅程 = 一份試算表，所以推送前要先把屬於這趟的記錄挑出來。 */
export const collectTripRecords = (
  data: AppData,
  tripId: string,
  changedSince = 0,
): Partial<Record<SyncedCollection, unknown[]>> => {
  const planIds = new Set(data.plans.filter((p) => p.tripId === tripId).map((p) => p.id))
  const itemIds = new Set(data.items.filter((i) => planIds.has(i.planId)).map((i) => i.id))
  const fresh = <T extends { updatedAt: number }>(rows: T[]) =>
    rows.filter((r) => r.updatedAt > changedSince)

  const trips = fresh(data.trips.filter((t) => t.id === tripId)).map((trip) => ({
    ...trip,
    startDate: normalizeStoredDate(trip.startDate) ?? trip.startDate,
    endDate: normalizeStoredDate(trip.endDate) ?? trip.endDate,
  }))
  const items = fresh(data.items.filter((i) => planIds.has(i.planId))).map((item) => ({
    ...item,
    date: normalizeStoredDate(item.date) ?? item.date,
    startTime: normalizeStoredTime(item.startTime) ?? item.startTime,
    chargeDate: normalizeStoredDate(item.chargeDate) ?? item.chargeDate,
  }))

  return {
    trips,
    plans: fresh(data.plans.filter((p) => p.tripId === tripId)),
    items,
    reviews: fresh(data.reviews.filter((r) => itemIds.has(r.itemId))),
    notes: fresh(data.notes.filter((n) => n.tripId === tripId)),
    payments: fresh(data.payments.filter((p) => p.tripId === tripId)),
    transports: fresh(data.transports.filter((t) => t.tripId === tripId)),
  }
}
