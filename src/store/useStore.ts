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
import { templateRowsFor } from '../lib/dayTemplate'
import { applyTemplate, quickItemBy } from '../lib/presets'
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
  buildInviteLink,
  analyzeRemoteReceipt,
  createRemoteTrip,
  describePlace,
  fetchFolderInfo,
  mergeRemote,
  parseFolderId,
  newSecret,
  ping,
  pullRemote,
  pushRemote,
  saveRemoteInvite,
  uploadRemotePhoto,
} from '../sync/client'
import { collectTripRecords } from '../sync/collect'
import { copyItemSnapshot } from '../lib/items'
import { duplicateItemCosts } from '../lib/costGroups'
import { followersOf, mirrorPatch, nightsBetween, stayNightsOf, touchesMirrored } from '../lib/stay'
import {
  appendCautions,
  buildAnalysisInput,
  formatPlaceInfo,
  mergeGuide,
  PLACE_MODEL,
  PLACE_SCHEMA,
  PLACE_TOOLS,
} from '../lib/placeInfo'
import placePrompt from '../data/placePrompt.md?raw'
import receiptPrompt from '../data/receiptPrompt.md?raw'
import { processReceiptScan, type ProcessedPhoto } from '../photos/process'
import { applyChannelRenames, renameChannel } from '../lib/channels'
import { renameChannelInItemDrafts } from './drafts'
import {
  buildReceiptAnalysisInput,
  parseReceiptData,
  RECEIPT_MODEL,
  RECEIPT_SCHEMA,
  type ReceiptClipboardCost,
} from '../lib/receiptClipboard'
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

/**
 * 地點分析的狀態刻意放在 store 而不是元件裡：請求要跑好幾秒，
 * 而使用者按完就會離開詳細頁 —— 狀態跟著元件卸載的話，回來就看不出還在跑。
 */
export interface AiState {
  /** 正在分析的項目 id。 */
  pending: string[]
  /** 失敗的項目 id → 原因。進去看過就移除，所以浮標的計數會自己縮到消失。 */
  errors: Record<string, string>
}

/** 一次分析走過的三段。使用者按完就走，回來要看得出停在哪一段。 */
export type ReceiptPhase = 'compressing' | 'analyzing' | 'applying'

export interface ReceiptProgress {
  phase: ReceiptPhase
  /**
   * 逾時的絕對時刻，只有 analyzing 有 —— 壓縮那段不計入那 60 秒。
   * 存時間戳而不是剩餘秒數：分頁切到背景時計時器會被節流，回前景要立刻算得出正確的秒數。
   */
  deadline?: number
}

/** 相機收據分析與地點分析生命週期不同，不能共用 pending key 與 flight。 */
export interface ReceiptState {
  pending: Record<string, ReceiptProgress>
  errors: Record<string, string>
  /** 分析完成後先留在 store；詳細頁回來時才把它加入現有費用草稿。 */
  results: Record<string, ReceiptClipboardCost>
}

interface State {
  data: AppData
  settings: Settings
  ready: boolean
  sync: SyncState
  ai: AiState
  receipt: ReceiptState
  /**
   * 只在本機編輯時遞增，同步拉回來的資料不算。
   * 介面靠它判斷「有東西該推上去了」，而不會被自己拉回來的更新再觸發一次同步而無限循環。
   */
  localRev: number
  pendingPhotos: PendingPhotoUpload[]

  init: () => Promise<void>
  setMemberName: (name: string) => void
  /** 心得配色；hue 傳 undefined 就是回到中性色。 */
  setReviewHue: (tripId: string, author: string, hue?: number) => void
  /** 介面配色；跟 reviewHues 一樣是這台裝置自己的偏好，不上傳。 */
  setTheme: (theme: 'dark' | 'light') => void
  /** 卡片上「還可刷」要看哪一條規則；ruleId 傳 undefined 就回到自動挑最緊的。 */
  setRewardRuleFocus: (methodId: string, ruleId?: string) => void
  /** 行程列的每筆金額顯示與否，全趟一起開關。同樣是本機偏好。 */
  toggleItemMoney: () => void
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

  /**
   * 指定退房日，補齊／收掉這一筆住宿底下的每一晚。
   * 縮短會刪掉多出來的那幾天（含它們的心得與照片），所以介面必須先跟使用者確認過才呼叫。
   */
  setStayCheckout: (sourceId: string, checkout: string) => void
  /**
   * 解除同步：只清掉記號，內容原地留下變成自己的，所以這個動作沒有風險。
   * 「同步自其他住宿」拿掉之後，這是舊資料裡那些手動從筆唯一的清除路徑 ——
   * 走 store 才會更新 `updatedAt` 推上雲端，同行者才收得到。
   */
  unlinkItem: (id: string) => void

  /** 用 Google Map 連結分析這個地點，結果寫進行程說明與備註。 */
  analyzePlace: (itemId: string) => Promise<void>
  /** 看過失敗訊息了，從浮標的計數移除。 */
  dismissAiError: (itemId: string) => void
  /** 拍照後分析收據；圖片只送 Gemini，不加入照片佇列。 */
  analyzeReceipt: (itemId: string, file: File) => Promise<void>
  consumeReceiptResult: (itemId: string) => void
  discardReceiptAnalysis: (itemId: string) => void

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
  /** 通路改名：掃過所有卡的規則與所有消費。key 是正規化後的舊名。 */
  renameChannels: (renames: Map<string, string>) => void

  createTransport: (tripId: string, name: string) => TransportOption
  updateTransport: (id: string, patch: Partial<TransportOption>) => void
  removeTransport: (id: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
const syncFlights = new Map<string, Promise<void>>()
const syncVersions = new Map<string, number>()
const photoUploadFlights = new Map<string, Promise<void>>()
/** 同一筆同時只跑一次分析；離開詳細頁不影響它，fetch 本來就跟 React 無關。 */
const aiFlights = new Map<string, Promise<void>>()
const receiptFlights = new Map<string, Promise<void>>()
const receiptVersions = new Map<string, number>()
const receiptControllers = new Map<string, AbortController>()
/** 開了搜尋之後一次要跑十幾二十秒，30 秒會把還在查的請求砍掉。 */
const AI_TIMEOUT_MS = 60_000
/** 收據自己一份：它現在有倒數，畫面上看得見，之後要調不該連地點分析一起動。 */
const RECEIPT_TIMEOUT_MS = 60_000

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
    ai: { pending: [], errors: {} },
    receipt: { pending: {}, errors: {}, results: {} },
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
          settings = {
            ...settings,
            photoApiVersion: pong.capabilities?.photos,
            inviteApiVersion: pong.capabilities?.invite,
            aiApiVersion: pong.capabilities?.ai,
            costGroupApiVersion: pong.capabilities?.costGroups,
            receiptAiApiVersion: pong.capabilities?.receiptAi,
          }
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

    setReviewHue: (tripId, author, hue) => {
      const current = getState().settings.reviewHues ?? {}
      const forTrip = { ...(current[tripId] ?? {}) }
      if (hue === undefined) delete forTrip[author]
      else forTrip[author] = hue
      const settings = { ...getState().settings, reviewHues: { ...current, [tripId]: forTrip } }
      setState({ settings })
      void saveSettings(settings)
    },

    setTheme: (theme) => {
      const settings = { ...getState().settings, theme }
      setState({ settings })
      void saveSettings(settings)
    },

    toggleItemMoney: () => {
      const settings = { ...getState().settings, hideItemMoney: !getState().settings.hideItemMoney }
      setState({ settings })
      void saveSettings(settings)
    },

    setRewardRuleFocus: (methodId, ruleId) => {
      const current = { ...(getState().settings.rewardRuleFocus ?? {}) }
      if (ruleId === undefined) delete current[methodId]
      else current[methodId] = ruleId
      const settings = { ...getState().settings, rewardRuleFocus: current }
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
      const days = eachDay(trip.startDate, trip.endDate)
      const dailyItems = days.flatMap((date, dayIndex) =>
        templateRowsFor(dayIndex === 0, dayIndex === days.length - 1).map<Item>((row) => {
          const base: Item = {
            ...stamp(),
            planId: plan.id,
            date,
            startTime: row.time,
            title: row.title,
            category: row.cat,
            notes: [],
            links: [],
            costs: [],
            costGroups: [],
          }
          // 標了 quick 的那幾筆沿用同一顆快選的預設值，手動補建與自動建出來的才會長一樣。
          const preset = row.cat && row.quick ? quickItemBy(row.cat, row.quick)?.preset : undefined
          return preset ? { ...base, ...applyTemplate(base, preset, trip).patch } : base
        }),
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
      const sources = data.items.filter((i) => i.planId === planId && !i.deleted)
      /*
       * 每個複本都是新 id，所以住宿的索引記號也要跟著改指到「複本裡的那一筆」。
       * 照抄的話新版本的從筆會指回舊版本的主筆 —— 改舊版會蓋掉新版，改新版卻什麼都不動，
       * 而且完全不會報錯。對不上的（來源沒被複製過來）就直接放掉索引，內容照樣留著。
       */
      const idMap = new Map(sources.map((i) => [i.id, newId()]))
      const copies = sources.map<Item>((i) => ({
        ...i,
        id: idMap.get(i.id)!,
        planId: plan.id,
        sourceItemId: i.sourceItemId ? idMap.get(i.sourceItemId) : undefined,
        updatedAt: Date.now(),
        updatedBy: getState().settings.memberName,
        notes: i.notes.map((n) => ({ ...n, id: newId() })),
        links: i.links.map((l) => ({ ...l, id: newId() })),
        ...duplicateItemCosts(i.costs, i.costGroups),
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
      const item: Item = { notes: [], links: [], costs: [], costGroups: [], ...input, ...stamp() }
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
        // 複製出來的是獨立一份。留著記號的話，複製一筆從筆就會憑空多出一晚，
        // 連住的晚數與退房日都是從從筆的日期推回去的，當場就對不上。
        sourceItemId: undefined,
        stayNight: undefined,
        notes: snapshot.notes.map((note) => ({ ...note, id: newId() })),
        links: snapshot.links.map((link) => ({ ...link, id: newId() })),
        ...duplicateItemCosts(snapshot.costs, snapshot.costGroups),
      }
      mutate((d) => ({ ...d, items: [...d.items, item] }))
      return item
    },

    /**
     * 同步欄位一改就立刻寫進所有從筆。傳播放在這裡而不是各個呼叫端，
     * 是因為改動來自很多路徑（區塊儲存、貼地圖連結、AI 分析寫回說明），
     * 漏掉任何一條都會是「畫面上主筆變了、從筆沒變」這種靜默的不一致。
     * 從筆的那四樣不可編輯，所以傳播永遠是單向的，不會有誰蓋掉誰的問題。
     */
    updateItem: (id, patch) =>
      mutate((d) => {
        const items = patchIn(d.items, id, patch)
        if (!touchesMirrored(patch)) return { ...d, items }
        const source = items.find((item) => item.id === id)
        // 只准一層：從筆自己底下不會有人，不必再往下傳。
        if (!source || source.sourceItemId) return { ...d, items }
        const followers = followersOf(items, id)
        if (!followers.length) return { ...d, items }
        const now = Date.now()
        const by = getState().settings.memberName
        const mirrored = mirrorPatch(source)
        return {
          ...d,
          items: items.map((item) =>
            item.sourceItemId === id && !item.deleted
              ? { ...item, ...mirrored, updatedAt: now, updatedBy: by }
              : item,
          ),
        }
      }),

    setStayCheckout: (sourceId, checkout) => {
      const { data } = getState()
      const source = data.items.find((item) => item.id === sourceId && !item.deleted)
      // 從筆不能自己再帶一串，只准一層。
      if (!source || source.sourceItemId) return
      const plan = data.plans.find((value) => value.id === source.planId && !value.deleted)
      const trip = plan && data.trips.find((value) => value.id === plan.tripId && !value.deleted)
      if (!trip) return

      const wanted = nightsBetween(source.date, checkout).filter(
        (date) => date >= trip.startDate && date <= trip.endDate,
      )
      // 只管連住排出來的那幾晚。手動挑來源的從筆（入住、退房）只是共用內容，
      // 不算一晚也不歸這裡管 —— 拿 followersOf 來算的話，改退房日會把入住那筆一起刪掉。
      const existing = stayNightsOf(data.items, sourceId)

      // 縮短時多出來的那幾天要下墓碑，連同它們的心得與照片 —— 借 removeItem 走同一條路，
      // 照片快取的清理才不會漏。介面已經先跟使用者確認過要刪哪幾天了。
      for (const follower of existing) {
        if (!wanted.includes(follower.date)) getState().removeItem(follower.id)
      }

      const have = new Set(existing.map((follower) => follower.date))
      const created: Item[] = wanted
        .filter((date) => !have.has(date))
        .map((date) => ({
          planId: source.planId,
          date,
          // 住宿列不佔時間軸：沒有時間就自動排在當天最後，也不會被算成「現在進行中」。
          startTime: undefined,
          category: source.category,
          costs: [],
          costGroups: [],
          ...mirrorPatch(source),
          sourceItemId: sourceId,
          stayNight: true,
          ...stamp(),
        }))
      if (created.length) mutate((d) => ({ ...d, items: [...d.items, ...created] }))
    },

    unlinkItem: (id) =>
      mutate((d) => ({
        ...d,
        items: patchIn(d.items, id, { sourceItemId: undefined, stayNight: undefined }),
      })),

    dismissAiError: (itemId) => {
      const { [itemId]: gone, ...errors } = getState().ai.errors
      if (gone === undefined) return
      setState({ ai: { ...getState().ai, errors } })
    },

    analyzePlace: (itemId) => {
      const existing = aiFlights.get(itemId)
      if (existing) return existing

      const setPending = (on: boolean) => {
        const ai = getState().ai
        const pending = on
          ? [...ai.pending.filter((id) => id !== itemId), itemId]
          : ai.pending.filter((id) => id !== itemId)
        setState({ ai: { ...ai, pending } })
      }
      const fail = (message: string) => {
        const ai = getState().ai
        setState({ ai: { ...ai, errors: { ...ai.errors, [itemId]: message } } })
      }

      const flight = (async () => {
        const { data, settings } = getState()
        const item = data.items.find((row) => row.id === itemId)
        if (!item || item.deleted) return
        const plan = data.plans.find((row) => row.id === item.planId)
        const trip = data.trips.find((row) => row.id === plan?.tripId)
        const link = trip ? settings.tripLinks?.[trip.id] : undefined

        if (!trip || !link || !settings.gasUrl) {
          fail('這趟旅程還沒接上同步，沒辦法分析。')
          return
        }
        if ((settings.aiApiVersion ?? 0) < 1) {
          fail('請先重新部署支援地點分析的 Apps Script。')
          return
        }

        // 逾時要自己管：後端卡住的話請求不會自己回來，浮標會一直掛著。
        const abort = new AbortController()
        const timer = setTimeout(() => abort.abort(), AI_TIMEOUT_MS)
        setPending(true)
        try {
          const { place } = await describePlace(
            settings.gasUrl,
            link,
            {
              prompt: placePrompt,
              input: buildAnalysisInput(item, trip),
              schema: PLACE_SCHEMA,
              model: PLACE_MODEL,
              tools: PLACE_TOOLS,
            },
            abort.signal,
          )
          // 等待期間那一筆可能被刪掉或改過，重新取一次再寫，不要拿舊快照覆蓋。
          const fresh = getState().data.items.find((row) => row.id === itemId)
          if (!fresh || fresh.deleted) return
          getState().updateItem(itemId, {
            guide: mergeGuide(fresh.guide, formatPlaceInfo(place)),
            notes: appendCautions(fresh.notes, place.cautions ?? []),
          })
          getState().dismissAiError(itemId)
        } catch (err) {
          fail(
            abort.signal.aborted
              ? '分析等太久了，再試一次。'
              : err instanceof Error ? err.message : '分析失敗。',
          )
        } finally {
          clearTimeout(timer)
          setPending(false)
        }
      })()

      aiFlights.set(itemId, flight)
      void flight.finally(() => {
        if (aiFlights.get(itemId) === flight) aiFlights.delete(itemId)
      })
      return flight
    },

    analyzeReceipt: (itemId, file) => {
      const existing = receiptFlights.get(itemId)
      if (existing) return existing

      const version = (receiptVersions.get(itemId) ?? 0) + 1
      receiptVersions.set(itemId, version)
      const current = getState().receipt
      const errors = { ...current.errors }
      const results = { ...current.results }
      delete errors[itemId]
      delete results[itemId]
      setState({ receipt: { ...current, errors, results } })

      const currentVersion = () => receiptVersions.get(itemId) === version
      const setPhase = (phase?: ReceiptPhase, deadline?: number) => {
        if (!currentVersion()) return
        const receipt = getState().receipt
        const pending = { ...receipt.pending }
        if (phase) pending[itemId] = deadline === undefined ? { phase } : { phase, deadline }
        else delete pending[itemId]
        setState({ receipt: { ...receipt, pending } })
      }
      const fail = (message: string) => {
        if (!currentVersion()) return
        const receipt = getState().receipt
        setState({ receipt: { ...receipt, errors: { ...receipt.errors, [itemId]: message } } })
      }

      const flight = (async () => {
        const { data, settings } = getState()
        const item = data.items.find((row) => row.id === itemId && !row.deleted)
        const plan = data.plans.find((row) => row.id === item?.planId && !row.deleted)
        const trip = data.trips.find((row) => row.id === plan?.tripId && !row.deleted)
        const link = trip ? settings.tripLinks?.[trip.id] : undefined

        if (!item || !trip || !link || !settings.gasUrl) {
          fail('這趟旅程還沒接上同步，沒辦法分析收據。')
          return
        }
        if ((settings.receiptAiApiVersion ?? 0) < 1) {
          fail('請先重新部署支援收據分析的 Apps Script。')
          return
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          fail('目前離線，無法分析收據。')
          return
        }

        setPhase('compressing')
        let abort: AbortController | undefined
        let timer: ReturnType<typeof setTimeout> | undefined
        let onVisible: (() => void) | undefined
        try {
          const processed = await processReceiptScan(file)
          if (!currentVersion()) return

          abort = new AbortController()
          receiptControllers.set(itemId, abort)
          const deadline = Date.now() + RECEIPT_TIMEOUT_MS
          timer = setTimeout(() => abort?.abort(), RECEIPT_TIMEOUT_MS)
          // 背景分頁的計時器會被節流甚至凍結，回前景時補判一次；
          // 只靠 setTimeout 的話，逾時可能晚上好幾分鐘才觸發，而畫面上的倒數早就歸零了。
          onVisible = () => {
            if (document.visibilityState === 'visible' && Date.now() >= deadline) abort?.abort()
          }
          document.addEventListener('visibilitychange', onVisible)
          setPhase('analyzing', deadline)
          const { receipt } = await analyzeRemoteReceipt(
            settings.gasUrl,
            link,
            {
              prompt: receiptPrompt,
              input: buildReceiptAnalysisInput(trip.foreignCurrency, trip.homeCurrency),
              schema: RECEIPT_SCHEMA,
              model: RECEIPT_MODEL,
            },
            processed.blob,
            abort.signal,
          )
          if (!currentVersion()) return

          setPhase('applying')
          const parsed = parseReceiptData(receipt)
          const supported = [trip.foreignCurrency, trip.homeCurrency]
          if (!supported.some((code) => code.toUpperCase() === parsed.currency)) {
            throw new Error(
              `收據辨識出的幣別是 ${parsed.currency}；這趟只能使用 ${[...new Set(supported)].join(' / ')}。`,
            )
          }
          const state = getState().receipt
          const nextErrors = { ...state.errors }
          delete nextErrors[itemId]
          setState({
            receipt: {
              ...state,
              errors: nextErrors,
              results: { ...state.results, [itemId]: parsed },
            },
          })
        } catch (error) {
          fail(
            abort?.signal.aborted
              ? '收據分析等太久了，再拍一次。'
              : error instanceof Error ? error.message : '收據分析失敗。',
          )
        } finally {
          if (timer) clearTimeout(timer)
          if (onVisible) document.removeEventListener('visibilitychange', onVisible)
          if (receiptControllers.get(itemId) === abort) receiptControllers.delete(itemId)
          setPhase(undefined)
        }
      })()

      receiptFlights.set(itemId, flight)
      void flight.finally(() => {
        if (receiptFlights.get(itemId) === flight) receiptFlights.delete(itemId)
      })
      return flight
    },

    consumeReceiptResult: (itemId) => {
      const receipt = getState().receipt
      if (!receipt.results[itemId]) return
      const results = { ...receipt.results }
      delete results[itemId]
      setState({ receipt: { ...receipt, results } })
    },

    discardReceiptAnalysis: (itemId) => {
      receiptVersions.set(itemId, (receiptVersions.get(itemId) ?? 0) + 1)
      receiptControllers.get(itemId)?.abort()
      receiptControllers.delete(itemId)
      receiptFlights.delete(itemId)
      const receipt = getState().receipt
      const errors = { ...receipt.errors }
      const results = { ...receipt.results }
      const pending = { ...receipt.pending }
      delete errors[itemId]
      delete results[itemId]
      delete pending[itemId]
      setState({ receipt: { pending, errors, results } })
    },

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
          // 主筆沒了，從筆就地解除同步，內容原地留著 —— 那是使用者自己的資料，
          // 不能跟著主筆一起消失，也不能留著一個指向墓碑的記號讓那幾格永遠鎖住。
          items: patchIn(d.items, id, { deleted: true } as Partial<Item>).map((item) =>
            item.sourceItemId === id && !item.deleted
              ? { ...item, sourceItemId: undefined, stayNight: undefined, updatedAt: now, updatedBy: by }
              : item,
          ),
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
        inviteApiVersion: pong?.capabilities?.invite,
        aiApiVersion: pong?.capabilities?.ai,
        costGroupApiVersion: pong?.capabilities?.costGroups,
        receiptAiApiVersion: pong?.capabilities?.receiptAi,
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
        inviteApiVersion: pong.capabilities?.invite,
        costGroupApiVersion: pong.capabilities?.costGroups,
        receiptAiApiVersion: pong.capabilities?.receiptAi,
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
          const hasUnsupportedCostGroupChanges =
            (settings.costGroupApiVersion ?? 0) < 1 &&
            Boolean(
              (outgoing.items as Item[] | undefined)?.some(
                (outgoingItem) => outgoingItem.costGroups.length > 0,
              ),
            )
          // 舊後端會接受整筆 item 卻漏掉 costGroups；不送比假裝成功安全，部署後再補送。
          if (hasUnsupportedCostGroupChanges) delete outgoing.items
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

          // 邀請連結是本機資料被清空後回得去雲端的唯一線索，趁著已經連上線留一份在試算表裡。
          // 失敗不影響這次同步的結果，游標不動，下次同步會再試一遍。
          const inviteUrl = buildInviteLink(settings.gasUrl, link)
          let inviteBackupUrl = link.inviteBackupUrl
          if ((getState().settings.inviteApiVersion ?? 0) >= 1 && inviteUrl !== inviteBackupUrl) {
            try {
              await saveRemoteInvite(settings.gasUrl, link, inviteUrl)
              inviteBackupUrl = inviteUrl
            } catch {
              // 舊後端或暫時的網路問題；保留舊值即可。
            }
            if (invalidated()) return
          }

          const nextLink: TripLinkState = {
            ...link,
            inviteBackupUrl,
            lastSyncAt,
            // 舊後端會靜默忽略未知的 photos 集合；保留游標才能在重新部署後補送墓碑。
            lastPushedAt:
              hasUnsupportedPhotoChanges || hasUnsupportedCostGroupChanges
                ? link.lastPushedAt
                : pushedAt,
          }
          const nextSettings = {
            ...getState().settings,
            tripLinks: { ...getState().settings.tripLinks, [tripId]: nextLink },
          }
          setState({
            settings: nextSettings,
            sync: {
              busy: false,
              error: hasUnsupportedCostGroupChanges
                ? '消費資料尚未同步：請重新部署最新版 Apps Script'
                : undefined,
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

    /**
     * 通路存的是名字不是 id（沒有 channels 集合），所以改名一定是全域的掃描替換：
     * 只改眼前那條規則的話，同一個通路會靜默分裂成新舊兩個，而那正是這整套設計要避免的事。
     *
     * 掃描範圍必須含未送出的行程草稿，否則草稿一存就把舊名字寫回來。
     * 外層的支付方式草稿由呼叫端自己換 —— 它在 React 狀態裡，store 看不到。
     */
    renameChannels: (renames) => {
      if (!renames.size) return
      const by = getState().settings.memberName
      const now = Date.now()
      mutate((d) => ({
        ...d,
        payments: d.payments.map((payment) => {
          let touched = false
          const rules = payment.rules.map((rule) => {
            const channels = applyChannelRenames(rule.channels, renames)
            if (channels === rule.channels) return rule
            touched = true
            return { ...rule, channels }
          })
          return touched ? { ...payment, rules, updatedAt: now, updatedBy: by } : payment
        }),
        items: d.items.map((item) => {
          let touched = false
          const costGroups = item.costGroups.map((group) => {
            const channel = renameChannel(group.channel, renames)
            if (channel === group.channel) return group
            touched = true
            return { ...group, channel }
          })
          return touched ? { ...item, costGroups, updatedAt: now, updatedBy: by } : item
        }),
      }))
      void renameChannelInItemDrafts((channel?: string) => renameChannel(channel, renames))
    },

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
