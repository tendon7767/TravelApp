import { create } from 'zustand'
import {
  emptyData,
  type AppData,
  type Item,
  type Note,
  type NoteBlock,
  type PaymentMethod,
  type Plan,
  type Photo,
  type Review,
  type SyncFields,
  type TransportOption,
  type Trip,
} from '../types'
import { newId } from '../lib/id'
import { addDays, dayCount, eachDay, todayISO } from '../lib/date'
import { DAY_TEMPLATE } from '../lib/dayTemplate'
import {
  DEFAULT_PACKING,
  defaultSettings,
  loadData,
  loadSettings,
  saveData,
  saveSettings,
  type Settings,
  type TripLinkState,
} from './db'
import {
  createRemoteTrip,
  fetchFolderInfo,
  mergeRemote,
  parseFolderId,
  newSecret,
  ping,
  pullRemote,
  pushRemote,
  uploadRemotePhoto,
} from '../sync/client'
import { collectTripRecords } from '../sync/collect'
import { copyItemSnapshot } from '../lib/items'
import type { ProcessedPhoto } from '../photos/process'
import {
  cacheThumbnail,
  loadPendingPhotos,
  removeCachedThumbnail,
  savePendingPhotos,
  type PendingPhotoUpload,
} from '../photos/queue'
import { photoThumbnailUrl } from '../photos/urls'


export interface SyncState {
  busy: boolean
  error?: string
  lastAt?: number
  /** 本機修改被同行者較新的版本蓋掉時記下來，不讓它默默消失 */
  overwritten: { id: string; by: string }[]
}

interface State {
  data: AppData
  settings: Settings
  ready: boolean
  sync: SyncState
  /**
   * 只在本機編輯時遞增，同步拉回來的資料不算。
   * 介面靠它判斷「有東西該推上去了」，而不會被自己拉回來的更新再觸發一次同步而無限循環。
   */
  localRev: number
  pendingPhotos: PendingPhotoUpload[]

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
  duplicateItem: (source: Item, targetPlanId: string, targetDate: string) => Item | undefined
  updateItem: (id: string, patch: Partial<Item>) => void
  removeItem: (id: string) => void

  queuePhoto: (tripId: string, itemId: string, photo: ProcessedPhoto) => Promise<void>
  retryPhoto: (id: string) => void
  removePhoto: (id: string) => void
  flushPhotoUploads: (tripId: string) => Promise<void>

  /** 每個人只寫自己那則，用暱稱當識別，所以不會互相覆蓋。 */
  setReview: (itemId: string, text: string) => void

  /** 回傳後端版本字串，用來確認新版本真的部署上去了 */
  setGasUrl: (url: string) => Promise<string | undefined>
  /** 指定試算表要建在哪個資料夾，回傳解析後的完整路徑供介面顯示 */
  setDriveFolder: (input: string) => Promise<string>
  /** 幫這趟在雲端硬碟建立試算表並記下密鑰 */
  connectTrip: (tripId: string) => Promise<void>
  /** 用邀請連結加入別人建立的旅程 */
  joinTrip: (gasUrl: string, sheetId: string, secret: string) => Promise<string | undefined>
  syncTrip: (tripId: string) => Promise<void>
  dismissOverwritten: () => void

  createNote: (tripId: string, title?: string) => Note
  updateNote: (id: string, patch: Partial<Note>) => void
  removeNote: (id: string) => void
  /** 把某張打包清單存成範本，下次新旅程沿用。 */
  savePackingTemplate: (noteId: string) => void

  createPayment: (tripId: string) => PaymentMethod
  updatePayment: (id: string, patch: Partial<PaymentMethod>) => void
  removePayment: (id: string) => void
  /** 回傳實際複製的張數；同名同持有人的卡片會被略過。 */
  copyPaymentsFrom: (fromTripId: string, toTripId: string) => number

  createTransport: (tripId: string, name: string) => TransportOption
  updateTransport: (id: string, patch: Partial<TransportOption>) => void
  removeTransport: (id: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
const syncFlights = new Map<string, Promise<void>>()
const syncVersions = new Map<string, number>()
const photoUploadFlights = new Map<string, Promise<void>>()

const invalidateTripSync = (tripId: string) => {
  syncVersions.set(tripId, (syncVersions.get(tripId) ?? 0) + 1)
  // fetch 本身無法可靠取消，但移除 map 後重新加入同一趟時可立刻開始新的同步。
  syncFlights.delete(tripId)
}

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
    setState({ data: next, localRev: getState().localRev + 1 })
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
    sync: { busy: false, overwritten: [] },
    localRev: 0,
    pendingPhotos: [],

    init: async () => {
      const [data, storedSettings, pendingPhotos] = await Promise.all([
        loadData(),
        loadSettings(),
        loadPendingPhotos(),
      ])
      let settings = storedSettings
      if (settings.gasUrl && (typeof navigator === 'undefined' || navigator.onLine)) {
        try {
          const pong = await ping(settings.gasUrl)
          settings = { ...settings, photoApiVersion: pong.capabilities?.photos }
          await saveSettings(settings)
        } catch {
          // 啟動不應被後端暫時無法連線卡住；保留上次確認過的 capability。
        }
      }
      setState({ data, settings, pendingPhotos, ready: true })
    },

    setMemberName: (memberName) => {
      const previous = getState().settings.memberName
      const settings = { ...getState().settings, memberName }
      setState({ settings })
      void saveSettings(settings)

      // 改名後舊心得若還掛在舊名字下，看起來就像另一個人寫的。
      if (previous && previous !== memberName) {
        mutate((d) => ({
          ...d,
          reviews: d.reviews.map((r) =>
            r.author === previous && !r.deleted
              ? { ...r, author: memberName, updatedAt: Date.now(), updatedBy: memberName }
              : r,
          ),
        }))
      }
    },

    setActive: (activeTripId, activePlanId) => {
      const settings = { ...getState().settings, activeTripId, activePlanId }
      setState({ settings })
      void saveSettings(settings)
    },

    createTrip: (input) => {
      const trip: Trip = { ...input, ...stamp() }
      const plan: Plan = { ...stamp(), tripId: trip.id, name: '規劃版', kind: 'planning' }
      const dailyItems = eachDay(trip.startDate, trip.endDate).flatMap((date) =>
        DAY_TEMPLATE.map<Item>((row) => ({
          ...stamp(),
          planId: plan.id,
          date,
          startTime: row.time,
          title: row.title,
          category: row.cat,
          notes: [],
          links: [],
          costs: [],
        })),
      )
      // 每趟都要打包，與其讓使用者每次從零開始，不如直接帶上次存的範本。
      const packing: Note = {
        ...stamp(),
        tripId: trip.id,
        title: '打包清單',
        links: [],
        blocks: (getState().settings.packingTemplate ?? DEFAULT_PACKING).map<NoteBlock>((text) => ({
          id: newId(),
          kind: 'check',
          text,
          done: false,
        })),
      }
      mutate((d) => ({
        ...d,
        trips: [...d.trips, trip],
        plans: [...d.plans, plan],
        items: [...d.items, ...dailyItems],
        notes: [...d.notes, packing],
      }))
      getState().setActive(trip.id, plan.id)
      return { trip, plan }
    },

    updateTrip: (id, patch) => mutate((d) => ({ ...d, trips: patchIn(d.trips, id, patch) })),

    /**
     * 只從這台裝置移除：直接清掉 IndexedDB 記錄與本機連結，不建立同步墓碑。
     * 雲端試算表完全不動，之後重新開邀請連結就能下載同一趟旅程。
     */
    removeTrip: (id) => {
      const { data, settings } = getState()
      const planIds = new Set(data.plans.filter((p) => p.tripId === id).map((p) => p.id))
      const itemIds = new Set(data.items.filter((i) => planIds.has(i.planId)).map((i) => i.id))
      const removedPhotos = data.photos.filter((photo) => photo.tripId === id)
      const pendingPhotos = getState().pendingPhotos.filter((photo) => photo.tripId !== id)
      const nextData: AppData = {
        trips: data.trips.filter((t) => t.id !== id),
        plans: data.plans.filter((p) => p.tripId !== id),
        items: data.items.filter((i) => !planIds.has(i.planId)),
        reviews: data.reviews.filter((r) => !itemIds.has(r.itemId)),
        photos: data.photos.filter((photo) => photo.tripId !== id),
        notes: data.notes.filter((n) => n.tripId !== id),
        payments: data.payments.filter((p) => p.tripId !== id),
        transports: data.transports.filter((t) => t.tripId !== id),
      }
      const tripLinks = { ...(settings.tripLinks ?? {}) }
      delete tripLinks[id]
      const nextSettings: Settings = {
        ...settings,
        tripLinks,
        activeTripId: settings.activeTripId === id ? undefined : settings.activeTripId,
        activePlanId: planIds.has(settings.activePlanId ?? '') ? undefined : settings.activePlanId,
      }

      invalidateTripSync(id)
      setState({
        data: nextData,
        settings: nextSettings,
        pendingPhotos,
        localRev: getState().localRev + 1,
        sync: { busy: false, overwritten: [] },
      })
      persist(nextData)
      void savePendingPhotos(pendingPhotos)
      removedPhotos.forEach((photo) => void removeCachedThumbnail(photoThumbnailUrl(photo.thumbnailFileId)))
      void saveSettings(nextSettings)
    },

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
          notes: i.notes.map((n) => ({ ...n, id: newId() })),
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
        const killedItems = new Set(d.items.filter((i) => i.planId === id).map((i) => i.id))
        const pendingPhotos = getState().pendingPhotos.filter((photo) => !killedItems.has(photo.itemId))
        setState({ pendingPhotos })
        void savePendingPhotos(pendingPhotos)
        d.photos
          .filter((photo) => killedItems.has(photo.itemId) && !photo.deleted)
          .forEach((photo) => void removeCachedThumbnail(photoThumbnailUrl(photo.thumbnailFileId)))
        return {
          ...d,
          plans: patchIn(d.plans, id, { deleted: true } as Partial<Plan>),
          items: d.items.map((i) =>
            i.planId === id && !i.deleted ? { ...i, deleted: true, updatedAt: now, updatedBy: by } : i,
          ),
          reviews: d.reviews.map((r) =>
            killedItems.has(r.itemId) && !r.deleted
              ? { ...r, deleted: true, updatedAt: now, updatedBy: by }
              : r,
          ),
          photos: d.photos.map((photo) =>
            killedItems.has(photo.itemId) && !photo.deleted
              ? { ...photo, deleted: true, updatedAt: now, updatedBy: by }
              : photo,
          ),
        }
      }),

    createItem: (input) => {
      const item: Item = { notes: [], links: [], costs: [], ...input, ...stamp() }
      mutate((d) => ({ ...d, items: [...d.items, item] }))
      return item
    },

    duplicateItem: (source, targetPlanId, targetDate) => {
      const { data } = getState()
      const sourcePlan = data.plans.find((plan) => plan.id === source.planId && !plan.deleted)
      const targetPlan = data.plans.find((plan) => plan.id === targetPlanId && !plan.deleted)
      if (!sourcePlan || !targetPlan || sourcePlan.id !== targetPlan.id) return undefined

      const trip = data.trips.find((value) => value.id === targetPlan.tripId && !value.deleted)
      if (!trip || targetDate < trip.startDate || targetDate > trip.endDate) return undefined

      const snapshot = copyItemSnapshot(source)
      if (!snapshot) return undefined
      const item: Item = {
        ...snapshot,
        ...stamp(),
        planId: targetPlanId,
        date: targetDate,
        deleted: undefined,
        notes: snapshot.notes.map((note) => ({ ...note, id: newId() })),
        links: snapshot.links.map((link) => ({ ...link, id: newId() })),
        costs: snapshot.costs.map((cost) => ({ ...cost, id: newId() })),
      }
      mutate((d) => ({ ...d, items: [...d.items, item] }))
      return item
    },

    updateItem: (id, patch) => mutate((d) => ({ ...d, items: patchIn(d.items, id, patch) })),

    /** 軟刪除：墓碑是 M4 同步用的，刪除前由介面負責跟使用者確認。 */
    removeItem: (id) =>
      mutate((d) => {
        const now = Date.now()
        const by = getState().settings.memberName
        const pendingPhotos = getState().pendingPhotos.filter((photo) => photo.itemId !== id)
        setState({ pendingPhotos })
        void savePendingPhotos(pendingPhotos)
        d.photos
          .filter((photo) => photo.itemId === id && !photo.deleted)
          .forEach((photo) => void removeCachedThumbnail(photoThumbnailUrl(photo.thumbnailFileId)))
        return {
          ...d,
          items: patchIn(d.items, id, { deleted: true } as Partial<Item>),
          reviews: d.reviews.map((r) =>
            r.itemId === id && !r.deleted
              ? { ...r, deleted: true, updatedAt: now, updatedBy: by }
              : r,
          ),
          photos: d.photos.map((photo) =>
            photo.itemId === id && !photo.deleted
              ? { ...photo, deleted: true, updatedAt: now, updatedBy: by }
              : photo,
          ),
        }
      }),

    queuePhoto: async (tripId, itemId, processed) => {
      const { data, settings } = getState()
      const item = data.items.find((value) => value.id === itemId && !value.deleted)
      const plan = item && data.plans.find((value) => value.id === item.planId && !value.deleted)
      if (!item || !plan || plan.tripId !== tripId || plan.kind !== 'actual') {
        throw new Error('照片只能加入實際版行程')
      }
      if (!settings.gasUrl || !settings.tripLinks?.[tripId]) throw new Error('請先連接雲端硬碟')
      if ((settings.photoApiVersion ?? 0) < 1) throw new Error('請先重新部署支援照片的 Apps Script')

      const upload: PendingPhotoUpload = {
        id: newId(),
        tripId,
        itemId,
        kind: processed.kind,
        mimeType: processed.mimeType,
        width: processed.width,
        height: processed.height,
        byteSize: processed.byteSize,
        fullBlob: processed.fullBlob,
        thumbnailBlob: processed.thumbnailBlob,
        updatedAt: Date.now(),
        updatedBy: settings.memberName,
        status: 'queued',
      }
      const pendingPhotos = [...getState().pendingPhotos, upload]
      setState({ pendingPhotos })
      await savePendingPhotos(pendingPhotos)
      if (typeof navigator === 'undefined' || navigator.onLine) void getState().syncTrip(tripId)
    },

    retryPhoto: (id) => {
      const pendingPhotos = getState().pendingPhotos.map((photo) =>
        photo.id === id ? { ...photo, status: 'queued' as const, error: undefined } : photo,
      )
      setState({ pendingPhotos })
      void savePendingPhotos(pendingPhotos)
      const upload = pendingPhotos.find((photo) => photo.id === id)
      if (upload && navigator.onLine) void getState().syncTrip(upload.tripId)
    },

    removePhoto: (id) => {
      const pending = getState().pendingPhotos.find((photo) => photo.id === id)
      if (pending) {
        const pendingPhotos = getState().pendingPhotos.filter((photo) => photo.id !== id)
        setState({ pendingPhotos })
        void savePendingPhotos(pendingPhotos)
        return
      }
      const existing = getState().data.photos.find((photo) => photo.id === id && !photo.deleted)
      if (!existing) return
      void removeCachedThumbnail(photoThumbnailUrl(existing.thumbnailFileId))
      mutate((data) => ({
        ...data,
        photos: patchIn(data.photos, id, { deleted: true } as Partial<Photo>),
      }))
    },

    flushPhotoUploads: (tripId) => {
      const existing = photoUploadFlights.get(tripId)
      if (existing) return existing
      const flight = (async () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return
        const { settings } = getState()
        const link = settings.tripLinks?.[tripId]
        if (!settings.gasUrl || !link || (settings.photoApiVersion ?? 0) < 1) return

        const ids = getState().pendingPhotos
          .filter((photo) => photo.tripId === tripId && photo.status === 'queued')
          .map((photo) => photo.id)
        for (const id of ids) {
          const upload = getState().pendingPhotos.find((photo) => photo.id === id)
          if (!upload || upload.status !== 'queued') continue
          let pendingPhotos = getState().pendingPhotos.map((photo) =>
            photo.id === id ? { ...photo, status: 'uploading' as const, error: undefined } : photo,
          )
          setState({ pendingPhotos })
          await savePendingPhotos(pendingPhotos)
          try {
            const photo = await uploadRemotePhoto(settings.gasUrl, link, upload)
            // 使用者可能在請求途中刪除照片、Item 或整個實際版。請求無法可靠取消，
            // 所以回應後若佇列已不在，就立刻建立墓碑，不能讓剛完成的檔案死灰復燃。
            if (!getState().pendingPhotos.some((value) => value.id === id)) {
              const tombstone: Photo = {
                ...photo,
                deleted: true,
                updatedAt: Date.now(),
                updatedBy: getState().settings.memberName,
              }
              const data = getState().data
              const nextData = { ...data, photos: [...data.photos, tombstone] }
              setState({ data: nextData, localRev: getState().localRev + 1 })
              persist(nextData)
              try {
                await pushRemote(settings.gasUrl, link, { photos: [tombstone] })
              } catch {
                // 墓碑已留在本機；下一次一般同步會再次送出。
              }
              continue
            }
            const data = getState().data
            const photos = data.photos.some((value) => value.id === photo.id)
              ? data.photos.map((value) => (value.id === photo.id ? photo : value))
              : [...data.photos, photo]
            const nextData = { ...data, photos }
            pendingPhotos = getState().pendingPhotos.filter((value) => value.id !== id)
            setState({ data: nextData, pendingPhotos })
            persist(nextData)
            await savePendingPhotos(pendingPhotos)
            void cacheThumbnail(photoThumbnailUrl(photo.thumbnailFileId))
          } catch (error) {
            const retryWhenOnline = typeof navigator !== 'undefined' && !navigator.onLine
            pendingPhotos = getState().pendingPhotos.map((photo) =>
              photo.id === id
                ? {
                    ...photo,
                    status: retryWhenOnline ? 'queued' as const : 'failed' as const,
                    error: error instanceof Error ? error.message : String(error),
                  }
                : photo,
            )
            setState({ pendingPhotos })
            await savePendingPhotos(pendingPhotos)
          }
        }
      })()
      photoUploadFlights.set(tripId, flight)
      void flight.finally(() => {
        if (photoUploadFlights.get(tripId) === flight) {
          photoUploadFlights.delete(tripId)
          if (
            (typeof navigator === 'undefined' || navigator.onLine) &&
            getState().pendingPhotos.some((photo) => photo.tripId === tripId && photo.status === 'queued')
          ) {
            setTimeout(() => void getState().flushPhotoUploads(tripId), 0)
          }
        }
      })
      return flight
    },

    setReview: (itemId, text) => {
      const author = getState().settings.memberName
      const existing = getState().data.reviews.find(
        (r) => r.itemId === itemId && r.author === author && !r.deleted,
      )
      if (existing) {
        mutate((d) => ({ ...d, reviews: patchIn(d.reviews, existing.id, { text }) }))
        return
      }
      const review: Review = { ...stamp(), itemId, author, text }
      mutate((d) => ({ ...d, reviews: [...d.reviews, review] }))
    },

    setGasUrl: async (url) => {
      const gasUrl = url.trim()
      const pong = gasUrl ? await ping(gasUrl) : undefined
      const settings = {
        ...getState().settings,
        gasUrl,
        photoApiVersion: pong?.capabilities?.photos,
      }
      setState({ settings })
      await saveSettings(settings)
      return pong?.version
    },

    setDriveFolder: async (input) => {
      const { settings } = getState()
      if (!settings.gasUrl) throw new Error('請先設定後端網址')
      const driveFolderId = parseFolderId(input)
      const info = await fetchFolderInfo(settings.gasUrl, driveFolderId || undefined)
      const next = { ...settings, driveFolderId: driveFolderId || undefined }
      setState({ settings: next })
      await saveSettings(next)
      return info.path
    },

    connectTrip: async (tripId) => {
      const { settings, data } = getState()
      if (!settings.gasUrl) throw new Error('尚未設定後端網址')
      const trip = data.trips.find((t) => t.id === tripId)
      if (!trip) throw new Error('找不到旅程')

      const secret = newSecret()
      const { sheetId, folderId } = await createRemoteTrip(
        settings.gasUrl,
        trip.name,
        secret,
        settings.driveFolderId,
      )
      const link: TripLinkState = { sheetId, folderId, secret, lastSyncAt: 0, lastPushedAt: 0 }
      const next = { ...settings, tripLinks: { ...settings.tripLinks, [tripId]: link } }
      setState({ settings: next })
      await saveSettings(next)
      await getState().syncTrip(tripId)
    },

    joinTrip: async (gasUrl, sheetId, secret) => {
      const [pulled, pong] = await Promise.all([
        pullRemote(gasUrl, { sheetId, secret }, 0),
        ping(gasUrl),
      ])
      const remoteTrip = pulled.records.trips.find((row) => row.id && !row.deleted)
      if (!remoteTrip) throw new Error('邀請的試算表裡找不到旅程資料')
      const tripId = String(remoteTrip.id)
      invalidateTripSync(tripId)
      const merged = mergeRemote(getState().data, pulled.records)
      const link: TripLinkState = { sheetId, secret, lastSyncAt: pulled.now, lastPushedAt: Date.now() }
      const settings = {
        ...getState().settings,
        gasUrl,
        photoApiVersion: pong.capabilities?.photos,
        tripLinks: { ...getState().settings.tripLinks, [tripId]: link },
      }
      setState({ data: merged.data, settings })
      persist(merged.data)
      await saveSettings(settings)
      return tripId
    },

    syncTrip: (tripId) => {
      // 進入頁面、focus、visibilitychange 與自動儲存可能同時觸發。
      // 同一趟只允許一個 pull→push 流程，避免較慢的請求最後寫回舊游標。
      const existing = syncFlights.get(tripId)
      if (existing) return existing

      const syncVersion = syncVersions.get(tripId) ?? 0
      const invalidated = () => (syncVersions.get(tripId) ?? 0) !== syncVersion

      const flight = (async () => {
        const { settings } = getState()
        const link = settings.tripLinks?.[tripId]
        if (!settings.gasUrl || !link) return
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setState({
            sync: { ...getState().sync, busy: false, error: '目前離線，恢復網路後會自動同步' },
          })
          return
        }

        setState({ sync: { ...getState().sync, busy: true, error: undefined } })
        try {
          // 先拉再推：先合併遠端的變更，本機較新的修改才不會在推送後被下一次拉取覆蓋。
          const pulled = await pullRemote(settings.gasUrl, link, link.lastSyncAt)
          if (invalidated()) return
          const merged = mergeRemote(getState().data, pulled.records)
          setState({ data: merged.data })
          persist(merged.data)

          const pushedAt = Date.now()
          const outgoing = collectTripRecords(merged.data, tripId, link.lastPushedAt)
          const hasUnsupportedPhotoChanges =
            (settings.photoApiVersion ?? 0) < 1 && Boolean(outgoing.photos?.length)
          if (hasUnsupportedPhotoChanges) delete outgoing.photos
          const hasOutgoing = Object.values(outgoing).some((rows) => rows && rows.length)
          const pushResult = hasOutgoing
            ? await pushRemote(settings.gasUrl, link, outgoing)
            : undefined
          if (invalidated()) return

          // 我方 pull 之後、push 之前若剛好有人送出更新，伺服器會拒絕我方較舊版本。
          // 立刻再拉一次，讓畫面當場收斂，不必等下次 focus 或手動同步。
          let lastSyncAt = pulled.now
          let overwritten = merged.overwritten
          if (pushResult?.rejected) {
            const repulled = await pullRemote(settings.gasUrl, link, pulled.now)
            if (invalidated()) return
            const reconciled = mergeRemote(getState().data, repulled.records)
            setState({ data: reconciled.data })
            persist(reconciled.data)
            lastSyncAt = repulled.now
            overwritten = [...overwritten, ...reconciled.overwritten]
          }

          const nextLink: TripLinkState = {
            ...link,
            lastSyncAt,
            // 舊後端會靜默忽略未知的 photos 集合；保留游標才能在重新部署後補送墓碑。
            lastPushedAt: hasUnsupportedPhotoChanges ? link.lastPushedAt : pushedAt,
          }
          const nextSettings = {
            ...getState().settings,
            tripLinks: { ...getState().settings.tripLinks, [tripId]: nextLink },
          }
          setState({
            settings: nextSettings,
            sync: {
              busy: false,
              lastAt: Date.now(),
              overwritten: overwritten.map((o) => ({ id: o.id, by: o.by })),
            },
          })
          await saveSettings(nextSettings)
          void getState().flushPhotoUploads(tripId)
        } catch (err) {
          setState({
            sync: { ...getState().sync, busy: false, error: err instanceof Error ? err.message : String(err) },
          })
        }
      })()

      syncFlights.set(tripId, flight)
      void flight.finally(() => {
        if (syncFlights.get(tripId) === flight) syncFlights.delete(tripId)
      })
      return flight
    },

    dismissOverwritten: () => setState({ sync: { ...getState().sync, overwritten: [] } }),

    createNote: (tripId, title = '') => {
      const note: Note = { ...stamp(), tripId, title, blocks: [], links: [] }
      mutate((d) => ({ ...d, notes: [...d.notes, note] }))
      return note
    },

    updateNote: (id, patch) => mutate((d) => ({ ...d, notes: patchIn(d.notes, id, patch) })),

    removeNote: (id) =>
      mutate((d) => ({ ...d, notes: patchIn(d.notes, id, { deleted: true } as Partial<Note>) })),

    savePackingTemplate: (noteId) => {
      const note = getState().data.notes.find((n) => n.id === noteId)
      if (!note) return
      const packingTemplate = note.blocks
        .filter((b) => b.kind === 'check' && b.text.trim())
        .map((b) => b.text.trim())
      const settings = { ...getState().settings, packingTemplate }
      setState({ settings })
      void saveSettings(settings)
    },

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

    /**
     * 卡片設定跨旅程沿用，只有額度要重填 —— 不必每趟從頭建一次。
     * 同名同持有人的卡片會略過，所以重複複製不會長出一堆分身，
     * 介面也就不必記「這顆按過了沒」。
     */
    copyPaymentsFrom: (fromTripId, toTripId) => {
      const key = (method: PaymentMethod) => `${method.name.trim()}|${method.owner?.trim() ?? ''}`
      const { payments } = getState().data
      const existing = new Set(
        payments.filter((p) => p.tripId === toTripId && !p.deleted).map(key),
      )
      const copies = payments
        .filter((p) => p.tripId === fromTripId && !p.deleted && !existing.has(key(p)))
        .map<PaymentMethod>((p) => ({
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
