import { addDays } from '../lib/date'
import { newId } from '../lib/id'
import { useStore } from '../store/useStore'
import { SETOUCHI } from './setouchi'

/** 一次性轉換：把試算表方案 A 倒進 App，不靜默修正原始資料的問題。 */
export const importSetouchi = (): string => {
  const { createTrip, createItem } = useStore.getState()
  const { trip, plan } = createTrip({
    name: SETOUCHI.name,
    startDate: SETOUCHI.startDate,
    endDate: SETOUCHI.endDate,
    homeCurrency: 'TWD',
    foreignCurrency: SETOUCHI.foreignCurrency,
    rate: SETOUCHI.rate,
  })

  for (const s of SETOUCHI.items) {
    createItem({
      planId: plan.id,
      date: addDays(SETOUCHI.startDate, s.day - 1),
      title: s.title,
      startTime: s.time,
      notes: s.notes ?? [],
      links: (s.links ?? []).map((l) => ({ id: newId(), label: l.label, url: l.url, kind: 'web' as const })),
      costs: (s.costs ?? []).map((c) => ({
        id: newId(),
        label: c.label,
        unitPrice: c.unitPrice,
        qty: c.qty ?? 1,
        unit: c.unit,
        currency: c.cur ?? SETOUCHI.foreignCurrency,
      })),
      category: s.cat,
      paymentStatus: s.pay,
      chargeDate: s.chargeDay ? addDays(SETOUCHI.startDate, s.chargeDay - 1) : undefined,
    })
  }

  return trip.id
}
