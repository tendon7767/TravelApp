import { create } from 'zustand'
import {
  emptyData,
  type AppData,
  type Item,
  type PaymentMethod,
  type Plan,
  type SyncFields,
  type TransportOption,
  type Trip,
} from '../types'
import { newId } from '../lib/id'
import { addDays, dayCount, todayISO } from '../lib/date'
import { defaultSettings, loadData, loadSettings, saveData, saveSettings, type Settings } from './db'


interface State {
  data: AppData
  settings: Settings
  ready: boolean

  init: () => Promise<void>
  setMemberName: (name: string) => void
  setActive: (tripId?: string, planId?: string) => void

  createTrip: (input: Omit<Trip, keyof SyncFields>) => { trip: Trip; plan: Plan }
  updateTrip: (id: string, patch: Partial<Trip>) => void
  removeTrip: (id: string) => void

  duplicatePlan: (planId: string, name: string, kind: Plan['kind']) => Plan | undefined
  updatePlan: (id: string, patch: Partial<Plan>) => void
  removePlan: (id: string) => void

  createItem: (input: Partial<Item> & { planId: string; date: string; title: string }) => Item
  updateItem: (id: string, patch: Partial<Item>) => void
  removeItem: (id: string) => void

  createPayment: (tripId: string) => PaymentMethod
  updatePayment: (id: string, patch: Partial<PaymentMethod>) => void
  removePayment: (id: string) => void
  copyPaymentsFrom: (fromTripId: string, toTripId: string) => number

  createTransport: (tripId: string, name: string) => TransportOption
  updateTransport: (id: string, patch: Partial<TransportOption>) => void
  removeTransport: (id: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

export const useStore = create<State>((setState, getState) => {
  /** 寫入 IndexedDB 用防抖，避免每按一次鍵就打一次資料庫。 */
  const persist = (data: AppData) => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void saveData(data), 250)
  }

  const stamp = (): SyncFields => ({
    id: newId(),
    updatedAt: Date.now(),
    updatedBy: getState().settings.memberName,
  })

  const mutate = (fn: (draft: AppData) => AppData) => {
    const next = fn(getState().data)
    setState({ data: next })
    persist(next)
  }

  const patchIn = <T extends SyncFields>(list: T[], id: string, patch: Partial<T>): T[] =>
    list.map((r) =>
      r.id === id ? { ...r, ...patch, updatedAt: Date.now(), updatedBy: getState().settings.memberName } : r,
    )

  return {
    data: emptyData(),
    settings: defaultSettings(),
    ready: false,

    init: async () => {
      const [data, settings] = await Promise.all([loadData(), loadSettings()])
      setState({ data, settings, ready: true })
    },

    setMemberName: (memberName) => {
      const settings = { ...getState().settings, memberName }
      setState({ settings })
      void saveSettings(settings)
    },

    setActive: (activeTripId, activePlanId) => {
      const settings = { ...getState().settings, activeTripId, activePlanId }
      setState({ settings })
      void saveSettings(settings)
    },

    createTrip: (input) => {
      const trip: Trip = { ...input, ...stamp() }
      const plan: Plan = { ...stamp(), tripId: trip.id, name: '規劃版', kind: 'planning' }
      mutate((d) => ({ ...d, trips: [...d.trips, trip], plans: [...d.plans, plan] }))
      getState().setActive(trip.id, plan.id)
      return { trip, plan }
    },

    updateTrip: (id, patch) => mutate((d) => ({ ...d, trips: patchIn(d.trips, id, patch) })),

    /** 旅程、底下的版本與項目一起下墓碑，不留孤兒資料。 */
    removeTrip: (id) =>
      mutate((d) => {
        const now = Date.now()
        const by = getState().settings.memberName
        const planIds = new Set(d.plans.filter((p) => p.tripId === id).map((p) => p.id))
        const kill = <T extends SyncFields>(r: T) => ({ ...r, deleted: true, updatedAt: now, updatedBy: by })
        return {
          trips: d.trips.map((t) => (t.id === id && !t.deleted ? kill(t) : t)),
          plans: d.plans.map((p) => (p.tripId === id && !p.deleted ? kill(p) : p)),
          items: d.items.map((i) => (planIds.has(i.planId) && !i.deleted ? kill(i) : i)),
          payments: d.payments.map((p) => (p.tripId === id && !p.deleted ? kill(p) : p)),
          transports: d.transports.map((t) => (t.tripId === id && !t.deleted ? kill(t) : t)),
        }
      }),

    duplicatePlan: (planId, name, kind) => {
      const { data } = getState()
      const source = data.plans.find((p) => p.id === planId)
      if (!source) return undefined

      const plan: Plan = { ...stamp(), tripId: source.tripId, name, kind, basedOnPlanId: source.id }

      /** 連同備註、連結、費用明細整份複製，複本之後各改各的。 */
      const copies = data.items
        .filter((i) => i.planId === planId && !i.deleted)
        .map<Item>((i) => ({
          ...i,
          id: newId(),
          planId: plan.id,
          updatedAt: Date.now(),
          updatedBy: getState().settings.memberName,
          notes: [...i.notes],
          links: i.links.map((l) => ({ ...l, id: newId() })),
          costs: i.costs.map((c) => ({ ...c, id: newId() })),
        }))

      mutate((d) => ({ ...d, plans: [...d.plans, plan], items: [...d.items, ...copies] }))
      return plan
    },

    updatePlan: (id, patch) => mutate((d) => ({ ...d, plans: patchIn(d.plans, id, patch) })),

    /** 版本連同底下的項目一起下墓碑，否則同步後會留下沒有歸屬的孤兒項目。 */
    removePlan: (id) =>
      mutate((d) => {
        const now = Date.now()
        const by = getState().settings.memberName
        return {
          ...d,
          plans: patchIn(d.plans, id, { deleted: true } as Partial<Plan>),
          items: d.items.map((i) =>
            i.planId === id && !i.deleted ? { ...i, deleted: true, updatedAt: now, updatedBy: by } : i,
          ),
        }
      }),

    createItem: (input) => {
      const item: Item = { notes: [], links: [], costs: [], ...input, ...stamp() }
      mutate((d) => ({ ...d, items: [...d.items, item] }))
      return item
    },

    updateItem: (id, patch) => mutate((d) => ({ ...d, items: patchIn(d.items, id, patch) })),

    /** 軟刪除：墓碑是 M4 同步用的，刪除前由介面負責跟使用者確認。 */
    removeItem: (id) =>
      mutate((d) => ({ ...d, items: patchIn(d.items, id, { deleted: true } as Partial<Item>) })),

    createPayment: (tripId) => {
      const method: PaymentMethod = {
        ...stamp(),
        tripId,
        name: '',
        kind: 'card',
        enabled: true,
        currency: 'TWD',
        rules: [{ id: newId(), name: '一般回饋', rate: 0 }],
      }
      mutate((d) => ({ ...d, payments: [...d.payments, method] }))
      return method
    },

    updatePayment: (id, patch) =>
      mutate((d) => ({ ...d, payments: patchIn(d.payments, id, patch) })),

    removePayment: (id) =>
      mutate((d) => ({
        ...d,
        payments: patchIn(d.payments, id, { deleted: true } as Partial<PaymentMethod>),
      })),

    /** 卡片設定跨旅程沿用，只有額度要重填 —— 不必每趟從頭建一次。 */
    copyPaymentsFrom: (fromTripId, toTripId) => {
      const source = getState().data.payments.filter((p) => p.tripId === fromTripId && !p.deleted)
      const copies = source.map<PaymentMethod>((p) => ({
        ...p,
        ...stamp(),
        tripId: toTripId,
        rules: p.rules.map((r) => ({ ...r, id: newId() })),
      }))
      if (copies.length) mutate((d) => ({ ...d, payments: [...d.payments, ...copies] }))
      return copies.length
    },

    createTransport: (tripId, name) => {
      const option: TransportOption = { ...stamp(), tripId, name, lines: [] }
      mutate((d) => ({ ...d, transports: [...d.transports, option] }))
      return option
    },

    updateTransport: (id, patch) =>
      mutate((d) => ({ ...d, transports: patchIn(d.transports, id, patch) })),

    removeTransport: (id) =>
      mutate((d) => ({
        ...d,
        transports: patchIn(d.transports, id, { deleted: true } as Partial<TransportOption>),
      })),
  }
})

/** 新旅程的預設值：以今天起算九天、日圓、你慣用的 0.21。 */
export const draftTrip = (): Omit<Trip, keyof SyncFields> => ({
  name: '',
  startDate: todayISO(),
  endDate: addDays(todayISO(), 8),
  homeCurrency: 'TWD',
  foreignCurrency: 'JPY',
  rate: 0.21,
})

export const tripDayCount = (trip: Trip): number => dayCount(trip.startDate, trip.endDate)
