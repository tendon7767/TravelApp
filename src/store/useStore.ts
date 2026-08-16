import { create } from 'zustand'
import { emptyData, type AppData, type Item, type Plan, type SyncFields, type Trip } from '../types'
import { newId } from '../lib/id'
import { addDays, dayCount, todayISO } from '../lib/date'
import { defaultSettings, loadData, loadSettings, saveData, saveSettings, type Settings } from './db'

type Collection = keyof AppData

interface UndoEntry {
  label: string
  collection: Collection
  id: string
  expiresAt: number
}

interface State {
  data: AppData
  settings: Settings
  ready: boolean
  undo: UndoEntry | null

  init: () => Promise<void>
  setMemberName: (name: string) => void
  setActive: (tripId?: string, planId?: string) => void

  createTrip: (input: Omit<Trip, keyof SyncFields>) => { trip: Trip; plan: Plan }
  updateTrip: (id: string, patch: Partial<Trip>) => void

  duplicatePlan: (planId: string, name: string, kind: Plan['kind']) => Plan | undefined
  updatePlan: (id: string, patch: Partial<Plan>) => void

  createItem: (input: Partial<Item> & { planId: string; date: string; title: string }) => Item
  updateItem: (id: string, patch: Partial<Item>) => void
  removeItem: (id: string) => void
  runUndo: () => void
  clearUndo: () => void
}

const UNDO_WINDOW_MS = 10_000

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
    undo: null,

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

    createItem: (input) => {
      const item: Item = { notes: [], links: [], costs: [], ...input, ...stamp() }
      mutate((d) => ({ ...d, items: [...d.items, item] }))
      return item
    },

    updateItem: (id, patch) => mutate((d) => ({ ...d, items: patchIn(d.items, id, patch) })),

    /** 軟刪除：墓碑同時服務 M4 的同步，也讓 10 秒內可以反悔。 */
    removeItem: (id) => {
      const item = getState().data.items.find((i) => i.id === id)
      mutate((d) => ({ ...d, items: patchIn(d.items, id, { deleted: true } as Partial<Item>) }))
      setState({
        undo: {
          label: item?.title ? `已刪除「${item.title}」` : '已刪除項目',
          collection: 'items',
          id,
          expiresAt: Date.now() + UNDO_WINDOW_MS,
        },
      })
    },

    runUndo: () => {
      const u = getState().undo
      if (!u) return
      mutate((d) => ({ ...d, items: patchIn(d.items, u.id, { deleted: false } as Partial<Item>) }))
      setState({ undo: null })
    },

    clearUndo: () => setState({ undo: null }),
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
