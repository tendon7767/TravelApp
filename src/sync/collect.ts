import type { AppData } from '../types'
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

  return {
    trips: fresh(data.trips.filter((t) => t.id === tripId)),
    plans: fresh(data.plans.filter((p) => p.tripId === tripId)),
    items: fresh(data.items.filter((i) => planIds.has(i.planId))),
    reviews: fresh(data.reviews.filter((r) => itemIds.has(r.itemId))),
    notes: fresh(data.notes.filter((n) => n.tripId === tripId)),
    payments: fresh(data.payments.filter((p) => p.tripId === tripId)),
    transports: fresh(data.transports.filter((t) => t.tripId === tripId)),
  }
}
