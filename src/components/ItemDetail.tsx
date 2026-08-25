import {
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useStore } from '../store/useStore'
import {
  ITINERARY_CATEGORIES,
  type CostLine,
  type Item,
  type ItineraryCategory,
  type LinkRef,
  type Trip,
} from '../types'
import { newId } from '../lib/id'
import { makeLink, parseLink, placeNameOf } from '../lib/maps'
import { formatMoney, formatTotals, lineTotal, sumByCurrency, toHome } from '../lib/money'
import { addDays, normalizeTime, shortDate } from '../lib/date'
import ConfirmButton from './ConfirmButton'
import NumberField from './NumberField'
import { methodLabel, OWNERLESS } from '../lib/owners'
import SettingsModal from './SettingsModal'
import Modal from './Modal'
import { amountInMethodCurrency, computeMethod, focusedRule, suggestSplit } from '../lib/rewards'
import {
  clearItemDraft,
  loadItemDraft,
  saveItemDraft,
  type GuidePart,
  type ItemDraftMode,
  type ItemDraftSection,
} from '../store/drafts'
import CategoryIcon from './CategoryIcon'
import TrashIcon from './TrashIcon'
import BackIcon from './BackIcon'
import CopyIcon from './CopyIcon'
import CloseIcon from './CloseIcon'
import MapPinIcon from './MapPinIcon'
import PencilIcon from './PencilIcon'
import LinkIcon from './LinkIcon'
import ExternalLinkIcon from './ExternalLinkIcon'
import MoneyIcon from './MoneyIcon'
import GlobeIcon from './GlobeIcon'
import ReviewIcon from './ReviewIcon'
import FlagIcon from './FlagIcon'
import TagIcon from './TagIcon'
import BookIcon from './BookIcon'
import StickyNoteIcon from './StickyNoteIcon'
import RewardsIcon from './RewardsIcon'
import { fetchLinkMetadata } from '../sync/client'
import { copyItemSnapshot } from '../lib/items'
import { flightStatusUrl, hasFlightStatus } from '../lib/flight'
import PlaneIcon from './PlaneIcon'
import PhotoSection from './PhotoSection'
import DragHandleIcon from './DragHandleIcon'
import { moveItem, useDragSort } from '../lib/useDragSort'
import { tagCharOf } from '../lib/reviewHues'
import PasteIcon from './PasteIcon'
import SparkleIcon from './SparkleIcon'
import { joinGuide, splitGuide } from '../lib/placeInfo'
import { checkoutOf, followersOf, mirrorPatch, nightsBetween, staySources } from '../lib/stay'

interface Props {
  trip: Trip
  itemId: string
  onClose: () => void
  onCopy: (item: Item) => void
  onDirtyChange: (dirty: boolean) => void
  /** 編輯中要停掉外層「滑到上下一筆」的手勢，打字時的拖曳不該換頁。 */
  onEditingChange?: (editing: boolean) => void
}

const SECTION_LABELS: Record<ItemDraftSection, string> = {
  basic: '基本資訊',
  guide: '行程說明',
  notes: '備註',
  links: '相關連結',
  costs: '費用',
  review: '心得',
}

// 備註、連結與費用的「新增」都會先長出一張空卡。空卡不該被當成未儲存變更；
// 比對與儲存前一律濾掉。既有備註若被清空，也依同一規則移除。
/*
 * 現金與其他不是支付方式記錄 —— 沒有回饋規則、不該出現在回饋頁 ——
 * 但仍然要能標在一筆花費上，所以借 paymentMethodId 存保留字。
 * id 都由 newId() 產生不會撞到這兩個字；而且「找不到對應的支付方式就是沒有回饋」
 * 這個行為本來就成立（computeMethod 是用 id 比對挑出自己的花費），
 * 所以回饋計算與同步層都不必為它們改任何東西。
 */
const OTHER_PAYMENTS = [
  ['cash', '現金'],
  ['other', '其他'],
] as const

const isBlankCost = (cost: CostLine) =>
  !cost.label.trim() && !cost.unitPrice

const filledCosts = (costs: CostLine[]) => costs.filter((cost) => !isBlankCost(cost))
const filledNotes = (notes: Item['notes']) => notes.filter((note) => note.text.trim())
/* 地圖連結一律帶著網址（解析完才建立），所以不必再為它留例外。 */
const filledLinks = (links: LinkRef[]) =>
  links.filter((link) => link.url.trim() || link.label.trim())

/**
 * 貼上地圖連結時把地名接在既有標題後面，不覆蓋 ——
 * 快選給的是「午餐」這種模板標題，加上店名才是完整的一行。
 * 標題裡已經有這個名字就原封不動，所以刪掉連結再貼一次不會變成「淺草今半 淺草今半」，
 * 地名當作連結標籤的備援（label 直接取自 item.title）那一路也不會自我疊加。
 */
const appendPlaceName = (title: string, place: string): string => {
  const name = place.trim()
  if (!name) return title
  const base = title.trim()
  if (!base) return name
  return base.includes(name) ? base : `${base} ${name}`
}

const autoGrowTextArea = (element: HTMLTextAreaElement | null) => {
  if (!element) return
  element.style.height = 'auto'
  const style = getComputedStyle(element)
  const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
  element.style.height = `${element.scrollHeight + borders}px`
}

export default function ItemDetail({
  trip,
  itemId,
  onClose,
  onCopy,
  onDirtyChange,
  onEditingChange,
}: Props) {
  const storedItem = useStore((state) => state.data.items.find((item) => item.id === itemId))
  const updateItem = useStore((state) => state.updateItem)
  const removeItem = useStore((state) => state.removeItem)
  const allPayments = useStore((state) => state.data.payments)
  const allItems = useStore((state) => state.data.items)
  const allReviews = useStore((state) => state.data.reviews)
  const allPhotos = useStore((state) => state.data.photos)
  const setStayCheckout = useStore((state) => state.setStayCheckout)
  const linkItemTo = useStore((state) => state.linkItemTo)
  const unlinkItem = useStore((state) => state.unlinkItem)
  const setReview = useStore((state) => state.setReview)
  const me = useStore((state) => state.settings.memberName)
  const gasUrl = useStore((state) => state.settings.gasUrl)
  const ruleFocus = useStore((state) => state.settings.rewardRuleFocus)
  const reviewHues = useStore((state) => state.settings.reviewHues?.[trip.id])
  const tripLink = useStore((state) => state.settings.tripLinks?.[trip.id])
  const analyzePlace = useStore((state) => state.analyzePlace)
  const dismissAiError = useStore((state) => state.dismissAiError)
  const aiPending = useStore((state) => state.ai.pending.includes(itemId))
  const aiError = useStore((state) => state.ai.errors[itemId])
  const isActual = useStore((state) =>
    state.data.plans.some(
      (plan) => plan.id === storedItem?.planId && plan.kind === 'actual' && !plan.deleted,
    ),
  )

  const [editingSections, setEditingSections] = useState<Set<ItemDraftSection>>(() => new Set())
  const [editMode, setEditMode] = useState<ItemDraftMode | 'none'>('none')
  /**
   * 哪個區塊該拿到游標。每個區塊各自寫死 autoFocus 的話，「編輯全部」一次展開全部，
   * 最後掛上的心得欄位會搶走焦點，整個畫面被拖到最下面。
   */
  const [focusSection, setFocusSection] = useState<ItemDraftSection | null>(null)
  /**
   * 行程說明點哪一塊就只開哪一格：手打的、或 AI 寫的。null 是兩格都開（編輯全部）。
   * 整塊一起編的話，想改手打那段的一個字，底下整片 AI 資訊也進了同一個輸入框，
   * 很容易連它一起動到 —— 而那塊是下次分析會整塊換掉的東西。
   */
  const [guidePart, setGuidePart] = useState<GuidePart | null>(null)
  /**
   * 編輯中的兩格內容。不從 `item.guide` 即時切 —— `splitGuide` 會修掉頭尾空白，
   * 打到結尾按 Enter 那一下會被當場吃掉。這裡保持原樣，`joinGuide` 寫回去時才收乾淨。
   */
  const [guideDraft, setGuideDraft] = useState({ own: '', ai: '' })
  /**
   * 進編輯的當下有沒有 AI 那塊。不直接看草稿內容 —— 那樣把 AI 格清空的瞬間
   * 格子自己就消失了，游標跟著沒了，想再打回去也沒得打。清空要到儲存才生效。
   */
  const [guideAiSlot, setGuideAiSlot] = useState(false)
  const [draftItem, setDraftItem] = useState(() => copyItemSnapshot(storedItem))
  const [timeDraft, setTimeDraft] = useState(storedItem?.startTime ?? '')
  const [reviewDraft, setReviewDraft] = useState('')
  const [mapDraft, setMapDraft] = useState('')
  /**
   * 貼上那一刻從整段文字裡拆出來的地名。
   * <input> 的值不能有換行，分享出來的「網址／地名／地址」三行貼進去會被黏成一串，
   * 事後再拆已經分不出哪裡是地名。所以在還看得到換行的時候就先拆好收在這裡。
   */
  const [mapNameDraft, setMapNameDraft] = useState('')
  const [resolvingLink, setResolvingLink] = useState<LinkRef['kind'] | null>(null)
  const [linkLookupError, setLinkLookupError] = useState('')
  const mapDraftRef = useRef<HTMLInputElement>(null)
  const guideTextAreaRef = useRef<HTMLTextAreaElement>(null)
  const guideAiTextAreaRef = useRef<HTMLTextAreaElement>(null)
  const reviewTextAreaRef = useRef<HTMLTextAreaElement>(null)
  const inactiveTapStartRef = useRef<{
    x: number
    y: number
    hadEditableFocus: boolean
  } | null>(null)
  const [focusCostId, setFocusCostId] = useState<string | null>(null)
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null)
  const [focusLinkId, setFocusLinkId] = useState<string | null>(null)
  const [choosingCategory, setChoosingCategory] = useState(false)
  const [pickingPayment, setPickingPayment] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  /** 退房日的草稿。空字串＝還沒選，儲存鍵就灰著。 */
  const [checkoutDraft, setCheckoutDraft] = useState<string | null>(null)
  /** 縮短連住時要刪掉的那幾天。有值就先跳確認，確定了才真的動手。 */
  const [confirmingStayCut, setConfirmingStayCut] = useState<string[] | null>(null)
  const [pickingStaySource, setPickingStaySource] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [restored, setRestored] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [touched, setTouched] = useState(false)
  /**
   * 失敗訊息在這裡留一份。一讀到就從 store 銷掉 —— 那代表「看過了」，左下角浮標的
   * 計數立刻縮；但這一頁要繼續看得到，直到你按重試或知道了。
   */
  const [seenAiError, setSeenAiError] = useState('')

  const reviews = useMemo(
    () => allReviews.filter((review) => review.itemId === itemId && !review.deleted),
    [allReviews, itemId],
  )
  const mine = reviews.find((review) => review.author === me)
  const others = reviews.filter((review) => review.author !== me && review.text.trim())
  const initialReviewText = useRef(mine?.text ?? '')
  const initialCategory = useRef(storedItem?.category)
  const initialMapUrl = useRef(storedItem?.links.find((link) => link.kind === 'map')?.url ?? '')
  const item = draftItem?.id === storedItem?.id ? draftItem : storedItem

  const methods = useMemo(
    () =>
      allPayments
        .filter((payment) => payment.tripId === trip.id && !payment.deleted && payment.enabled)
        .sort((a, b) =>
          methodLabel(a.name, a.owner).localeCompare(methodLabel(b.name, b.owner), 'en', {
            sensitivity: 'base',
            numeric: true,
          }),
        ),
    [allPayments, trip.id],
  )
  const method = methods.find((payment) => payment.id === item?.paymentMethodId)

  const splitHint = useMemo(() => {
    if (!item || !method) return null
    const otherItems = allItems.filter(
      (candidate) => candidate.id !== item.id && candidate.planId === item.planId,
    )
    const spent = computeMethod(method, otherItems, trip).txns.map((transaction) => transaction.amount)
    return suggestSplit(method, amountInMethodCurrency(item, method, trip), spent)
  }, [item, method, allItems, trip])

  /*
   * 每張卡還能刷多少、以及回饋是不是拿滿了。
   * 「拿滿」是所有規則都有上限且都歸零；只要還有一條沒上限的規則，這張卡就永遠有回饋。
   * 算的時候排除這筆自己的花費，因為要問的是「這筆用這張刷還划算嗎」，
   * 跟旁邊 splitHint 的算法一致。規劃版不計算回饋，所以整個不算。
   */
  const methodStatus = useMemo(() => {
    const map = new Map<string, { remaining?: number; exhausted: boolean }>()
    if (!isActual || !item) return map
    const others = allItems.filter(
      (candidate) => candidate.id !== item.id && candidate.planId === item.planId && !candidate.deleted,
    )
    for (const payment of methods) {
      const { rules } = computeMethod(payment, others, trip)
      map.set(payment.id, {
        // 跟回饋頁看到的是同一條規則，否則同一張卡在兩個畫面會給出不同的數字。
        remaining: focusedRule(rules, ruleFocus?.[payment.id])?.remainingSpend,
        // 停用與否問的是「這張還有沒有回饋可拿」，跟看哪條規則無關。
        exhausted: rules.length > 0 && rules.every((rule) => rule.remainingSpend === 0),
      })
    }
    return map
  }, [methods, allItems, item, trip, isActual, ruleFocus])

  // 依持有者分區，同一區裡把拿滿回饋的沉到最後，其餘維持 methods 既有的名稱排序。
  const pickerGroups = useMemo(() => {
    const map = new Map<string, typeof methods>()
    for (const payment of methods) {
      const owner = payment.owner?.trim() || OWNERLESS
      map.set(owner, [...(map.get(owner) ?? []), payment])
    }
    return [...map.entries()].map(([owner, list]) => {
      const sorted = [...list].sort(
        (a, b) =>
          Number(methodStatus.get(a.id)?.exhausted ?? false) -
          Number(methodStatus.get(b.id)?.exhausted ?? false),
      )
      return [owner, sorted] as const
    })
  }, [methods, methodStatus])

  const itemDirty = useMemo(() => {
    if (!item || !storedItem) return false
    return (
      item.title !== storedItem.title ||
      item.date !== storedItem.date ||
      normalizeTime(timeDraft) !== normalizeTime(storedItem.startTime ?? '') ||
      (item.guide ?? '') !== (storedItem.guide ?? '') ||
      item.category !== storedItem.category ||
      JSON.stringify(filledNotes(item.notes)) !== JSON.stringify(filledNotes(storedItem.notes)) ||
      JSON.stringify(filledLinks(item.links)) !== JSON.stringify(filledLinks(storedItem.links)) ||
      JSON.stringify(filledCosts(item.costs)) !== JSON.stringify(filledCosts(storedItem.costs))
    )
  }, [item, storedItem, timeDraft])
  const activeSection: ItemDraftSection | 'category' | undefined =
    editMode === 'section'
      ? choosingCategory
        ? 'category'
        : editingSections.values().next().value
      : undefined
  // 地圖網址是基本資訊裡的一格草稿，跟已存的那筆連結比才知道有沒有動過。
  const storedMapUrl = storedItem?.links.find((link) => link.kind === 'map')?.url ?? ''
  const mapDirty =
    (editMode === 'all' || editingSections.has('basic')) && mapDraft.trim() !== storedMapUrl
  const dirty = itemDirty || reviewDraft !== (mine?.text ?? '') || mapDirty

  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    onEditingChange?.(editMode !== 'none')
    return () => onEditingChange?.(false)
  }, [editMode, onEditingChange])

  useEffect(() => {
    let cancelled = false
    void loadItemDraft(itemId).then((saved) => {
      if (cancelled) return
      if (saved) {
        // 舊版把尚未加入的備註／連結另外存成單一字串；還原時轉成新版的草稿卡片。
        const restoredItem = copyItemSnapshot(saved.item) ?? saved.item
        if (saved.noteDraft?.trim()) {
          restoredItem.notes.push({ id: newId(), text: saved.noteDraft })
        }
        if (saved.webDraft?.trim()) {
          restoredItem.links.push({ id: newId(), kind: 'web', url: '', label: saved.webDraft })
        }
        setDraftItem(restoredItem)
        setGuidePart(saved.guidePart ?? null)
        const restoredGuide = splitGuide(restoredItem.guide)
        setGuideDraft(restoredGuide)
        setGuideAiSlot(restoredGuide.ai.trim() !== '')
        setTimeDraft(saved.timeDraft)
        setReviewDraft(saved.reviewDraft)
        // 舊草稿的 Google Map 是獨立區塊，現在併進基本資訊。
        const legacySections = (saved.sections ?? (saved.section ? [saved.section] : [])) as string[]
        const savedSections = new Set(
          legacySections.map((name) => (name === 'map' ? 'basic' : name)) as ItemDraftSection[],
        )
        // 舊版的 mapDraft 是「還沒按加入的那一格」，空的代表當時在改既有連結的標籤；
        // 新版那一格就是網址本身，空的代表要刪掉，所以舊草稿要把已存的網址補回去。
        setMapDraft(
          saved.mapDraft?.trim()
            ? saved.mapDraft
            : legacySections.includes('map')
              ? initialMapUrl.current
              : (saved.mapDraft ?? ''),
        )
        setMapNameDraft(saved.mapNameDraft ?? '')
        const restoredMode = saved.mode ?? (savedSections.size > 1 ? 'all' : 'section')
        const categoryOnly =
          restoredMode === 'section' &&
          (saved.activeSection === 'category' ||
            (savedSections.size === 0 && saved.item.category !== initialCategory.current))
        setEditMode(restoredMode)
        setEditingSections(savedSections)
        setChoosingCategory(restoredMode === 'all' || categoryOnly)
        setRestored(true)
        setTouched(true)
      } else {
        setReviewDraft(initialReviewText.current)
      }
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [itemId])

  // 同行者同步進來時，尚未動手的詳細頁要跟著刷新，不能拿開啟當下的舊草稿覆蓋它。
  useEffect(() => {
    if (!hydrated || touched || !storedItem) return
    setDraftItem(copyItemSnapshot(storedItem))
    // 說明的兩格也要跟著刷新 —— 分析剛跑完的那一筆就是這樣把 AI 那塊帶進來的。
    const guideParts = splitGuide(storedItem.guide)
    setGuideDraft(guideParts)
    setGuideAiSlot(guideParts.ai.trim() !== '')
    setTimeDraft(storedItem.startTime ?? '')
    setReviewDraft(mine?.text ?? '')
  }, [hydrated, touched, storedItem, mine?.text])

  useEffect(() => {
    if (!hydrated || !item) return
    if (dirty) {
      saveItemDraft(itemId, {
        item,
        timeDraft,
        reviewDraft,
        mode: editMode === 'none' ? undefined : editMode,
        activeSection,
        guidePart: guidePart ?? undefined,
        mapDraft,
        mapNameDraft,
        sections: [...editingSections],
      })
    }
    else void clearItemDraft(itemId)
  }, [
    hydrated,
    editingSections,
    editMode,
    activeSection,
    guidePart,
    dirty,
    item,
    itemId,
    timeDraft,
    reviewDraft,
    mapDraft,
    mapNameDraft,
  ])

  // 失敗訊息搬到本機留一份，並從 store 銷掉 —— 那就是「看過了」，浮標的計數立刻縮。
  useEffect(() => {
    if (!aiError) return
    setSeenAiError(aiError)
    dismissAiError(itemId)
  }, [aiError, dismissAiError, itemId])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // 文字變動時同步增高或縮回；layout effect 可避免使用者看到調整前的一幀。
  useLayoutEffect(() => {
    autoGrowTextArea(guideTextAreaRef.current)
    autoGrowTextArea(guideAiTextAreaRef.current)
    autoGrowTextArea(reviewTextAreaRef.current)
  }, [guideDraft, reviewDraft, editingSections])

  // 旋轉裝置或桌面改變視窗寬度後，折行數可能不同，需要重新量內容高度。
  useEffect(() => {
    let frame = 0
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        autoGrowTextArea(guideTextAreaRef.current)
        autoGrowTextArea(guideAiTextAreaRef.current)
        autoGrowTextArea(reviewTextAreaRef.current)
      })
    }
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  /*
   * 備註與相關連結都是使用者自己排的清單，順序有意義（先做的寫前面），
   * 所以編輯時左邊的項目符號換成握把，按住可以上下拖。
   * 兩個 hook 得排在下面那個提前 return 之前 —— hook 的呼叫順序每次算繪都要一樣，
   * 所以取值一律 optional chaining；項目不存在時清單是空的，握把本來也不會出現。
   */
  const noteSort = useDragSort(item?.notes.map((note) => note.id) ?? [], (from, to) => {
    if (item) patchItem({ notes: moveItem(item.notes, from, to) })
  })
  /*
   * 相關連結只排 kind === 'web' 這幾筆，地圖連結不在這張清單裡（它住在基本資訊）。
   * 寫回去時把排好的依序填回原本屬於 web 的那幾個位置，地圖那筆留在原地不動。
   */
  const linkSort = useDragSort(
    item?.links.filter((link) => link.kind === 'web').map((link) => link.id) ?? [],
    (from, to) => {
      if (!item) return
      const sorted = moveItem(item.links.filter((link) => link.kind === 'web'), from, to)
      let cursor = 0
      patchItem({
        links: item.links.map((link) => (link.kind === 'web' ? sorted[cursor++] : link)),
      })
    },
  )

  if (!item || !storedItem || item.deleted) return <div className="empty">項目已刪除。</div>

  const totals = sumByCurrency(item.costs)
  const home = toHome(totals, trip)
  const showConverted = !totals[trip.homeCurrency] || Object.keys(totals).length > 1
  const mapLink = item.links.find((link) => link.kind === 'map')
  const webLinks = item.links.filter((link) => link.kind === 'web')

  /*
   * 住宿的資料同步。
   * 主筆（syncSource 為空）可以指定退房日，把中間每一晚都建出來；
   * 從筆（syncSource 有值）的四樣是主筆的鏡像，唯讀，除非按下解除同步。
   * 日期與時間不在同步範圍裡 —— 每晚幾點回房本來就各自不同，那兩格從筆照樣能改。
   */
  const syncSource = storedItem.sourceItemId
    ? allItems.find((value) => value.id === storedItem.sourceItemId && !value.deleted)
    : undefined
  const mirrored = Boolean(syncSource)
  const stayFollowers = followersOf(allItems, storedItem.id)
  const stayCheckout = checkoutOf(allItems, storedItem.id)
  const isStay = item.category === '住宿'
  const sourceOptions = mirrored || stayFollowers.length ? [] : staySources(allItems, storedItem)
  /*
   * 連住的主筆：自己就是主筆，從筆則指向來源那一筆。
   * 晚數與退房日一律從主筆算，從筆才看得到「這是第幾晚、住到哪天」。
   */
  const stayHead = mirrored ? syncSource : storedItem
  const stayHeadFollowers = stayHead ? followersOf(allItems, stayHead.id) : []
  const stayNights = stayHeadFollowers.length ? stayHeadFollowers.length + 1 : 0
  const stayHeadCheckout = stayHead ? checkoutOf(allItems, stayHead.id) : undefined
  /*
   * 連住成立之後就不給改類型。改成別的類型，這幾筆之間的連動與那幾格的鎖
   * 全部失去依據，卻沒有任何地方會報錯 —— 先擋住，要改就先解除同步或收掉連住。
   */
  const stayLocked = mirrored || stayFollowers.length > 0
  /** 從筆的鏡像區塊整塊不給點；剩下的照舊。 */
  const sectionLocked = (section: ItemDraftSection) =>
    mirrored && (section === 'guide' || section === 'notes' || section === 'links')

  const patchItem = (patch: Partial<Item>) => {
    setTouched(true)
    setDraftItem((current) => (current ? { ...current, ...patch } : current))
  }

  /** 兩格分開改，但存回去的仍是同一個 `guide` 字串 —— 資料結構與同步層都不必動。 */
  const patchGuide = (patch: Partial<typeof guideDraft>) => {
    const next = { ...guideDraft, ...patch }
    setGuideDraft(next)
    patchItem({ guide: joinGuide(next.own, next.ai) })
  }

  const beginEdit = (section: ItemDraftSection, part: GuidePart = 'own') => {
    setGuidePart(section === 'guide' ? part : null)
    const guideParts = splitGuide(item.guide)
    setGuideDraft(guideParts)
    setGuideAiSlot(guideParts.ai.trim() !== '')
    setFocusCostId(null)
    setFocusNoteId(null)
    setFocusLinkId(null)
    setMapDraft(storedMapUrl)
    setMapNameDraft('')
    // 空區塊點進去就先建立第一張草稿卡；空卡不算變更，儲存時也會濾掉。
    if (section === 'costs' && item.costs.length === 0) {
      const costId = newId()
      patchItem({
        costs: [
          { id: costId, label: '', unitPrice: 0, qty: 1, currency: trip.foreignCurrency },
        ],
      })
      setFocusCostId(costId)
    } else if (section === 'notes' && item.notes.length === 0) {
      const noteId = newId()
      patchItem({ notes: [{ id: noteId, text: '' }] })
      setFocusNoteId(noteId)
    } else if (section === 'links' && webLinks.length === 0) {
      const linkId = newId()
      patchItem({ links: [...item.links, { id: linkId, kind: 'web', url: '', label: '' }] })
      setFocusLinkId(linkId)
    }
    setLinkLookupError('')
    setRestored(false)
    setFocusSection(section)
    setEditMode('section')
    setEditingSections(new Set([section]))
  }

  const editableSections: ItemDraftSection[] = (
    [
      'basic',
      'guide',
      'notes',
      'costs',
      'links',
      ...(isActual ? (['review'] as const) : []),
    ] as ItemDraftSection[]
  ).filter((section) => !sectionLocked(section))
  const hasEditing = editMode !== 'none'
  // 分析讀的是已儲存的資料，所以看 storedItem 而不是草稿。
  const savedMapLink = storedItem.links.some((link) => link.kind === 'map' && link.url.trim())
  const aiDisabledReason = hasEditing
    ? '請先完成或取消編輯'
    : aiPending
      ? '分析中'
      : mirrored
        ? '行程說明同步自其他住宿，請到那一筆分析'
        : !savedMapLink
          ? '需要先在基本資訊加入 Google Map 連結'
          : ''

  const beginEditAll = () => {
    // 編輯全部就是兩格都開，沒有「只編其中一塊」的問題。
    setGuidePart(null)
    const guideParts = splitGuide(item.guide)
    setGuideDraft(guideParts)
    setGuideAiSlot(guideParts.ai.trim() !== '')
    setFocusLinkId(null)
    setFocusNoteId(null)
    setMapDraft(storedMapUrl)
    setMapNameDraft('')
    setRestored(false)
    setChoosingCategory(!stayLocked)
    setFocusCostId(null)
    setEditMode('all')
    // 展開全部時焦點固定回標題，它在最上面，畫面不會被拉走。
    setFocusSection('basic')
    setEditingSections(new Set(editableSections))
  }

  const sectionActionProps = (section: ItemDraftSection) => {
    if (editMode !== 'none' || sectionLocked(section)) return {}
    return {
      role: 'button' as const,
      'aria-label': `編輯${SECTION_LABELS[section]}`,
      tabIndex: 0,
      onClick: () => beginEdit(section),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        beginEdit(section)
      },
    }
  }

  /**
   * 行程說明裡的兩塊各自是一個入口。整個區塊本身也是可點的（點抬頭或空白處＝改手打那塊），
   * 所以這裡一定要擋掉冒泡 —— 不擋的話兩層一起觸發，最後開到的是外層那一個。
   */
  const guidePartProps = (part: GuidePart) => {
    // 兩塊各自是獨立的點擊入口，區塊層的鎖蓋不到它們，這裡要自己再擋一次。
    if (editMode !== 'none' || sectionLocked('guide')) return {}
    const label = part === 'ai' ? '編輯 AI 資訊' : '編輯行程說明'
    const begin = (event: { stopPropagation: () => void }) => {
      event.stopPropagation()
      beginEdit('guide', part)
    }
    return {
      role: 'button' as const,
      'aria-label': label,
      tabIndex: 0,
      onClick: (event: ReactMouseEvent<HTMLElement>) => begin(event),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        begin(event)
      },
    }
  }

  const beginEditCategory = () => {
    setFocusLinkId(null)
    setRestored(false)
    setEditMode('section')
    setEditingSections(new Set())
    setChoosingCategory(true)
  }

  // 行程類型自成一個區塊，點整塊任何位置都是改類型，不會誤觸基本資訊。
  const categoryActionProps = choosingCategory || stayLocked
    ? {}
    : editMode !== 'none'
      ? {}
    : {
        role: 'button' as const,
        'aria-label': '編輯行程類型',
        tabIndex: 0,
        onClick: () => beginEditCategory(),
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          beginEditCategory()
        },
      }

  const discardAndClose = () => {
    setConfirmingCancel(false)
    void clearItemDraft(itemId)
    onClose()
  }

  const cancelEditing = () => {
    setDraftItem(copyItemSnapshot(storedItem))
    setGuidePart(null)
    setTimeDraft(storedItem.startTime ?? '')
    setReviewDraft(mine?.text ?? '')
    setMapDraft('')
    setMapNameDraft('')
    setFocusCostId(null)
    setFocusNoteId(null)
    setFocusLinkId(null)
    setEditingSections(new Set())
    setEditMode('none')
    setFocusSection(null)
    setChoosingCategory(false)
    setConfirmingCancel(false)
    setRestored(false)
    setTouched(false)
    void clearItemDraft(itemId)
  }

  const requestCancel = () => {
    if (dirty) setConfirmingCancel(true)
    else if (hasEditing) cancelEditing()
    else discardAndClose()
  }

  const beginInactiveSectionTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      editMode !== 'section' ||
      !window.matchMedia('(max-width: 859px)').matches ||
      event.target !== event.currentTarget
    ) {
      inactiveTapStartRef.current = null
      return
    }
    const active = document.activeElement
    inactiveTapStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      hadEditableFocus:
        active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable]'),
    }
  }

  const finishInactiveSectionTap = (event: ReactMouseEvent<HTMLDivElement>) => {
    const start = inactiveTapStartRef.current
    inactiveTapStartRef.current = null
    if (
      !start ||
      editMode !== 'section' ||
      event.target !== event.currentTarget ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8
    ) return

    // 第一次點外面只收鍵盤；等 Visual Viewport 復原後再點一次才真正取消。
    if (start.hadEditableFocus) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      return
    }
    if (document.documentElement.dataset.kb === 'on') return
    requestCancel()
  }

  const completeEditing = async () => {
    const normalizedTime = normalizeTime(timeDraft)
    const withMap = await applyMapDraft(item)
    const normalizedLinks = await resolvePendingWebLinks(withMap.links)
    const nextItem = {
      ...withMap,
      notes: filledNotes(withMap.notes),
      links: normalizedLinks,
      costs: filledCosts(withMap.costs),
    }
    if (itemDirty || mapDirty) {
      updateItem(item.id, {
        startTime: normalizedTime,
        category: nextItem.category,
        costs: nextItem.costs,
        // 從筆的那四樣是主筆的鏡像，這裡不寫回去。草稿是進入編輯那一刻的複本，
        // 期間主筆若被改過，寫回去等於拿舊的鏡像蓋掉新的。日期則是連住排出來的。
        ...(mirrored
          ? {}
          : {
              date: nextItem.date,
              title: nextItem.title,
              guide: nextItem.guide,
              notes: nextItem.notes,
              links: nextItem.links,
            }),
      })
    }
    if (isActual && reviewDraft !== (mine?.text ?? '')) setReview(item.id, reviewDraft)
    setTimeDraft(normalizedTime ?? '')
    setMapDraft('')
    setMapNameDraft('')
    setFocusCostId(null)
    setFocusNoteId(null)
    setFocusLinkId(null)
    setEditingSections(new Set())
    setEditMode('none')
    setFocusSection(null)
    setGuidePart(null)
    setChoosingCategory(false)
    setTouched(false)
    setRestored(false)
    void clearItemDraft(item.id)
  }

  const finishSectionEditing = (nextItem = item, normalizedTime = timeDraft) => {
    setDraftItem(copyItemSnapshot(nextItem))
    setTimeDraft(normalizedTime)
    setMapDraft('')
    setMapNameDraft('')
    setFocusCostId(null)
    setFocusNoteId(null)
    setFocusLinkId(null)
    setEditingSections(new Set())
    setEditMode('none')
    setFocusSection(null)
    setGuidePart(null)
    setChoosingCategory(false)
    setTouched(false)
    setRestored(false)
    void clearItemDraft(item.id)
  }

  const commitSection = (section: ItemDraftSection, nextItem = item) => {
    const normalizedTime = normalizeTime(timeDraft) ?? ''
    let patch: Partial<Item> | undefined

    switch (section) {
      case 'basic':
        // 地圖連結併進這一區之後，地名會接在標題後面，兩者必須一起寫回去。
        // 只寫 links 的話那段標題會靜默消失 —— 草稿留著新標題、store 裡沒有，
        // 畫面看起來存好了，重開才發現變回「午餐」。
        patch = {
          startTime: normalizedTime || undefined,
          // 從筆的名稱、連結與日期都不是自己的，這一區只剩時間可以寫回去。
          // 不排除的話，草稿裡那份（等於當下的鏡像）會被當成自己的修改存進去，
          // 主筆下一次改動再蓋回來 —— 看起來像「改了又自己變回去」。
          ...(mirrored
            ? {}
            : { date: nextItem.date, title: nextItem.title, links: filledLinks(nextItem.links) }),
        }
        nextItem = {
          ...nextItem,
          startTime: normalizedTime || undefined,
          links: filledLinks(nextItem.links),
        }
        break
      case 'guide':
        patch = { guide: nextItem.guide }
        break
      case 'notes':
        patch = { notes: filledNotes(nextItem.notes) }
        nextItem = { ...nextItem, notes: filledNotes(nextItem.notes) }
        break
      case 'costs':
        patch = { costs: filledCosts(nextItem.costs) }
        nextItem = { ...nextItem, costs: filledCosts(nextItem.costs) }
        break
      case 'links':
        patch = { links: filledLinks(nextItem.links) }
        nextItem = { ...nextItem, links: filledLinks(nextItem.links) }
        break
      case 'review':
        if (isActual && reviewDraft !== (mine?.text ?? '')) setReview(item.id, reviewDraft)
        break
    }

    if (patch) updateItem(item.id, patch)
    finishSectionEditing(nextItem, normalizedTime)
  }

  const selectCategory = (category?: ItineraryCategory) => {
    if (editMode === 'section') {
      const nextItem = { ...item, category }
      if (category !== storedItem.category) updateItem(item.id, { category })
      finishSectionEditing(nextItem)
      return
    }
    patchItem({ category })
  }

  const toggleNoteOverview = (noteId: string, checked: boolean) => {
    const notes = item.notes.map((note) =>
      note.id === noteId ? { ...note, showInOverview: checked || undefined } : note,
    )
    // 閱讀狀態下的勾選是低風險單一選項，直接生效；編輯中則仍屬於那份草稿。
    if (editMode === 'none') updateItem(item.id, { notes })
    else patchItem({ notes })
  }

  const patchCost = (id: string, patch: Partial<CostLine>) =>
    patchItem({ costs: item.costs.map((cost) => (cost.id === id ? { ...cost, ...patch } : cost)) })

  const addCost = () => {
    const costId = newId()
    patchItem({
      costs: [
        ...item.costs,
        { id: costId, label: '', unitPrice: 0, qty: 1, currency: trip.foreignCurrency },
      ],
    })
    setFocusCostId(costId)
  }

  const addNoteCard = () => {
    const noteId = newId()
    patchItem({ notes: [...item.notes, { id: noteId, text: '' }] })
    setFocusNoteId(noteId)
  }

  const addWebLinkCard = () => {
    const linkId = newId()
    patchItem({
      links: [...item.links, { id: linkId, kind: 'web', url: '', label: '' }],
    })
    setFocusLinkId(linkId)
  }

  const resolveLinkValue = async (value: string, kind: LinkRef['kind'], pastedLabel = '') => {
    const parsed = { ...makeLink(value), kind }
    if (pastedLabel) parsed.label = pastedLabel
    let link = parsed

    // 桌機從網址列複製的是長網址，地名就寫在 /maps/place/ 裡，本地拆得出來就不必多跑一趟
    // 後端 —— 省掉的不只是等待，離線時這條路照樣成立。短網址與一般網站才需要展開。
    const needsLookup = kind === 'web' || parseLink(parsed.url).needsExpand

    if (needsLookup && gasUrl && tripLink && /^https?:\/\//i.test(parsed.url)) {
      try {
        const metadata = await fetchLinkMetadata(gasUrl, tripLink, parsed.url)
        link = {
          ...parsed,
          url: metadata.url || parsed.url,
          /*
           * **地圖以貼上的文字為準，後端展開只是備援。** 手機分享出來的那一行就是
           * Google 地圖自己給的地名，最準；後端只能從展開後的網址猜，而那一段
           * 對某些地點就是整串地址（實測「草間彌生『赤南瓜』」回來的是門牌與郵遞區號）。
           * 一般網頁相反：那裡沒有可貼的名字，頁面標題才是名字。
           */
          label:
            kind === 'map'
              ? parsed.label || metadata.label.trim()
              : metadata.label.trim() || parsed.label,
        }
      } catch {
        setLinkLookupError('無法讀取連結名稱，已使用預設備援名稱。')
      }
    }
    if (kind === 'map') link = { ...link, label: placeNameOf(link.label) }
    if (!link.label && kind === 'map') link = { ...link, label: item.title }
    return link
  }

  /**
   * 地圖網址是基本資訊裡的一格草稿，按儲存才解析（跟先前獨立區塊的行為一樣）。
   * 清空欄位就是刪掉那筆連結；網址沒動過就原封不動，不必再跑一趟後端。
   */
  const applyMapDraft = async (source: Item): Promise<Item> => {
    const url = mapDraft.trim()
    const current = source.links.find((link) => link.kind === 'map')
    if (url === (current?.url ?? '')) return source
    if (!url) return { ...source, links: source.links.filter((link) => link.kind !== 'map') }

    setLinkLookupError('')
    setResolvingLink('map')
    let link: LinkRef
    try {
      link = await resolveLinkValue(url, 'map', mapNameDraft)
    } finally {
      setResolvingLink(null)
    }
    return {
      ...source,
      title: appendPlaceName(source.title, link.label),
      links: [...source.links.filter((value) => value.kind !== 'map'), link],
    }
  }

  const saveBasicSection = async () => {
    commitSection('basic', await applyMapDraft(item))
  }

  const resolvePendingWebLinks = async (links: LinkRef[]) => {
    const cleanLinks = filledLinks(links)
    const hasPending = cleanLinks.some(
      (link) => link.kind === 'web' && !link.url.trim() && link.label.trim(),
    )
    if (!hasPending) return cleanLinks

    setLinkLookupError('')
    setResolvingLink('web')
    try {
      return await Promise.all(
        cleanLinks.map(async (link) => {
          if (link.kind !== 'web' || link.url.trim() || !link.label.trim()) return link
          const resolved = await resolveLinkValue(link.label, 'web')
          return { ...resolved, id: link.id, kind: 'web' as const }
        }),
      )
    } finally {
      setResolvingLink(null)
    }
  }

  const saveLinksSection = async () => {
    const links = await resolvePendingWebLinks(item.links)
    commitSection('links', { ...item, links })
  }

  const pickedMethod = methods.find((payment) => payment.id === item.paymentMethodId)
  const pickedOtherPayment = OTHER_PAYMENTS.find(([id]) => id === item.paymentMethodId)
  const hasPickedMethod = Boolean(pickedMethod || pickedOtherPayment)

  const pickedMethodLabel = pickedMethod
    ? methodLabel(pickedMethod.name, pickedMethod.owner)
    : (pickedOtherPayment?.[1] ?? '未設定')

  // 支付方式是獨立且即選即存的設定；其他單區塊正在編輯時則跟著退到背景。
  const paymentActionProps = editMode === 'section'
    ? {}
    : {
        role: 'button' as const,
        'aria-label': `設定支付方式，目前為${pickedMethodLabel}`,
        tabIndex: 0,
        onClick: () => setPickingPayment(true),
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          setPickingPayment(true)
        },
      }

  const choosePayment = (id?: string) => {
    if (id !== item.paymentMethodId) {
      updateItem(item.id, { paymentMethodId: id })
      setDraftItem((current) => (current ? { ...current, paymentMethodId: id } : current))
    }
    setPickingPayment(false)
  }

  /** 貼進來的整段文字（還帶著換行）拆成網址與地名，欄位裡只留乾淨的網址。 */
  const takeMapPaste = (text: string) => {
    setTouched(true)
    const parsed = makeLink(text)
    setMapDraft(/^https?:\/\//i.test(parsed.url) ? parsed.url : text.replace(/\s+/g, ' ').trim())
    setMapNameDraft(placeNameOf(parsed.label))
  }

  const pasteLinkDraft = async (kind: LinkRef['kind'], linkId?: string) => {
    setLinkLookupError('')
    try {
      const value = await navigator.clipboard.readText()
      if (kind === 'map') {
        takeMapPaste(value)
        requestAnimationFrame(() => mapDraftRef.current?.focus())
      } else if (linkId) {
        patchItem({
          links: item.links.map((link) =>
            // 換行壓成空白：欄位存不下換行，黏成一串會連網址都拆不出來。
            link.id === linkId ? { ...link, label: value.replace(/\s+/g, ' ').trim() } : link,
          ),
        })
        requestAnimationFrame(() => document.getElementById(`web-link-${linkId}`)?.focus())
      }
    } catch {
      setLinkLookupError('無法讀取剪貼簿，請確認瀏覽器權限。')
    }
  }

  const activeSectionDirty = (() => {
    switch (activeSection) {
      case 'basic':
        return (
          item.title !== storedItem.title ||
          item.date !== storedItem.date ||
          normalizeTime(timeDraft) !== normalizeTime(storedItem.startTime ?? '') ||
          mapDirty
        )
      case 'guide':
        return (item.guide ?? '') !== (storedItem.guide ?? '')
      case 'notes':
        return JSON.stringify(filledNotes(item.notes)) !== JSON.stringify(filledNotes(storedItem.notes))
      case 'costs':
        return JSON.stringify(filledCosts(item.costs)) !== JSON.stringify(filledCosts(storedItem.costs))
      case 'links':
        return JSON.stringify(filledLinks(webLinks)) !== JSON.stringify(
          filledLinks(storedItem.links.filter((link) => link.kind === 'web')),
        )
      case 'review':
        return reviewDraft !== (mine?.text ?? '')
      case 'category':
        return item.category !== storedItem.category
      default:
        return false
    }
  })()

  const sectionAction = (() => {
    if (editMode !== 'section' || !activeSection || activeSection === 'category') return undefined
    if (activeSection === 'basic') {
      return {
        disabled: !activeSectionDirty || resolvingLink !== null,
        run: () => void saveBasicSection(),
      }
    }
    if (activeSection === 'links') {
      return {
        disabled: !activeSectionDirty || resolvingLink !== null,
        run: () => void saveLinksSection(),
      }
    }
    return {
      disabled: !activeSectionDirty || resolvingLink !== null,
      run: () => commitSection(activeSection),
    }
  })()

  /*
   * 退房日。按儲存才動手，而且縮短要先跳確認 —— 刪掉的那幾天會連同它們的心得與照片
   * 一起下墓碑，同步之後同行者那邊也會消失，不能靜默做。
   */
  /*
   * 退房日預設帶入這筆行程自己的日期。空白的日期欄位在手機上要從頭選年月日，
   * 帶入當天就只差往後撥一兩天；它比入住日早一天以上，儲存鍵會一直灰著，按不出錯。
   */
  const openCheckout = () => setCheckoutDraft(stayCheckout ?? storedItem.date)

  const applyCheckout = (checkout: string) => {
    setStayCheckout(storedItem.id, checkout)
    setConfirmingStayCut(null)
    setCheckoutDraft(null)
  }

  const submitCheckout = () => {
    if (!checkoutDraft) return
    const wanted = new Set(nightsBetween(storedItem.date, checkoutDraft))
    const cut = stayFollowers.filter((row) => !wanted.has(row.date)).map((row) => row.date)
    if (cut.length) setConfirmingStayCut(cut)
    else applyCheckout(checkoutDraft)
  }

  const checkoutModal = checkoutDraft !== null && !confirmingStayCut && (
    <Modal
      title={stayCheckout ? '修改退房日' : '新增連住'}
      onCancel={() => setCheckoutDraft(null)}
      onComplete={submitCheckout}
      completeLabel={stayCheckout ? '儲存' : '新增'}
      completeDisabled={!checkoutDraft || checkoutDraft <= storedItem.date || checkoutDraft === stayCheckout}
    >
      <label className="label" htmlFor="d-checkout">退房日</label>
      <input
        id="d-checkout"
        className="field mono"
        type="date"
        min={storedItem.date}
        max={addDays(trip.endDate, 1)}
        value={checkoutDraft}
        onChange={(event) => setCheckoutDraft(event.target.value)}
      />
      <p className="dim detail-stay-hint">
        {checkoutDraft && checkoutDraft > storedItem.date
          ? `${shortDate(storedItem.date)} 入住、${shortDate(checkoutDraft)} 退房，共 ${
              nightsBetween(storedItem.date, checkoutDraft).length + 1
            } 晚。中間每一晚都會自動建立一筆住宿，資料同步自這一筆。`
          : '退房日要晚於入住日。'}
      </p>
    </Modal>
  )

  const stayCutModal = confirmingStayCut && checkoutDraft && (
    <Modal
      title="要刪掉這幾晚嗎？"
      onCancel={() => setConfirmingStayCut(null)}
      onComplete={() => applyCheckout(checkoutDraft)}
      cancelLabel="重新選"
      completeLabel="刪除"
      completeDanger
    >
      <p style={{ margin: 0 }}>把退房日改成 {shortDate(checkoutDraft)}，這幾天的住宿會被刪掉：</p>
      <ul className="detail-stay-cut">
        {confirmingStayCut.map((date) => {
          const row = stayFollowers.find((value) => value.date === date)
          const reviews = row
            ? allReviews.filter((value) => value.itemId === row.id && !value.deleted).length
            : 0
          const photos = row
            ? allPhotos.filter((value) => value.itemId === row.id && !value.deleted).length
            : 0
          const extra = [
            reviews ? `${reviews} 則心得` : '',
            photos ? `${photos} 張照片` : '',
          ].filter(Boolean)
          return (
            <li key={date}>
              {shortDate(date)}
              {extra.length > 0 && <span className="dim">（含 {extra.join('、')}）</span>}
            </li>
          )
        })}
      </ul>
      <p className="dim detail-stay-hint">刪掉之後心得與照片救不回來，同步後同行者那邊也會一起消失。</p>
    </Modal>
  )

  /*
   * 選完來源就退回檢視狀態。留在編輯裡的話畫面上什麼都不會變 ——
   * 那幾格已經變成唯讀，但顯示的是草稿裡的舊值，看起來像沒點到。
   * 草稿直接丟掉：被同步的那四樣本來就要被主筆覆蓋，留著只會顯示成已儲存的假象。
   * 新的內容當場算給 finishSectionEditing，不等 effect 補 —— 那要多繪一幀舊畫面。
   */
  const chooseStaySource = (source: Item) => {
    linkItemTo(storedItem.id, source.id)
    setPickingStaySource(false)
    finishSectionEditing(
      { ...storedItem, ...mirrorPatch(source), sourceItemId: source.id },
      storedItem.startTime ?? '',
    )
  }

  const staySourceModal = pickingStaySource && (
    <Modal title="同步自哪一筆住宿？" onCancel={() => setPickingStaySource(false)} variant="picker">
      <div className="picker-body">
        <div className="picker-grid">
          {sourceOptions.map((option) => (
            <button
              key={option.id}
              className="picker-card"
              onClick={() => chooseStaySource(option)}
            >
              <span className="picker-card-band">{option.title || '未命名行程'}</span>
              <span className="picker-card-body">
                <span className="picker-card-label">{shortDate(option.date)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )

  const paymentModal = pickingPayment && (
    <Modal title="選擇支付方式" onCancel={() => setPickingPayment(false)} variant="picker">
      <div className="picker-body">
        {pickerGroups.map(([owner, list]) => (
          <div key={owner} className="picker-group">
            <div className="picker-group-head">{owner}</div>
            <div className="picker-grid">
              {list.map((payment) => {
                const status = methodStatus.get(payment.id)
                const uncapped = status?.remaining === undefined
                return (
                  <button
                    key={payment.id}
                    className="picker-card"
                    disabled={status?.exhausted}
                    onClick={() => choosePayment(payment.id)}
                  >
                    <span className="picker-card-band">{payment.name || '未命名'}</span>
                    {status && (
                      <span className="picker-card-body">
                        <span className="picker-card-label">{status.exhausted ? '回饋' : '還可刷'}</span>
                        <span
                          className={status.exhausted || uncapped ? 'picker-card-value' : 'picker-card-value mono'}
                          data-bad={status.exhausted}
                        >
                          {status.exhausted
                            ? '已拿滿'
                            : uncapped
                              ? '無上限'
                              : formatMoney(status.remaining!, payment.currency)}
                        </span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* 現金與其他不是支付方式記錄，沒有回饋可算，所以只有名稱一行。 */}
        <div className="picker-group">
          <div className="picker-group-head">其他</div>
          <div className="picker-grid">
            {OTHER_PAYMENTS.map(([id, label]) => (
              <button key={label} className="picker-card" onClick={() => choosePayment(id)}>
                <span className="picker-card-band">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )

  return (
    <>
      {confirmingCancel && (
        <Modal
          title="尚未儲存變更"
          onCancel={() => setConfirmingCancel(false)}
          onComplete={hasEditing ? cancelEditing : discardAndClose}
          cancelLabel={hasEditing ? '繼續編輯' : '繼續查看'}
          completeLabel="放棄變更"
          completeDanger
        >
          <p style={{ margin: 0 }}>
            {editMode === 'all'
              ? '確定要取消編輯並放棄這次的全部修改嗎？'
              : hasEditing
                ? '確定要取消並放棄這個區塊的修改嗎？'
              : '確定要離開並放棄這次的全部修改嗎？'}
          </p>
        </Modal>
      )}
      {renaming && <SettingsModal onClose={() => setRenaming(false)} />}
      {paymentModal}
      {checkoutModal}
      {stayCutModal}
      {staySourceModal}

      <div className="topbar detail-head">
        <button
          className="btn btn-sm btn-glyph btn-plain"
          onClick={requestCancel}
          aria-label="返回行程列表"
        >
          <BackIcon size={22} />
        </button>
        <span className="detail-head-gap" />
        <button
          className="btn btn-sm btn-glyph btn-plain"
          onClick={() => void analyzePlace(itemId)}
          disabled={Boolean(aiDisabledReason)}
          aria-label="用 AI 分析這個地點"
          title={aiDisabledReason || '用 AI 分析這個地點'}
        >
          <SparkleIcon size={20} />
        </button>
        <ConfirmButton
          label={<TrashIcon size={20} />}
          ariaLabel="刪除這個項目"
          className="btn btn-sm btn-glyph btn-plain"
          question="刪除這個項目？"
          onConfirm={() => {
            removeItem(item.id)
            void clearItemDraft(item.id)
            onClose()
          }}
        />
        <button
          className="btn btn-sm btn-glyph btn-plain"
          onClick={() => onCopy(storedItem)}
          disabled={hasEditing}
          aria-label="複製這筆行程"
          title={hasEditing ? '請先完成或取消編輯' : '複製這筆行程'}
        >
          <CopyIcon size={20} />
        </button>
        <button
          className="btn btn-sm btn-glyph btn-plain detail-edit-all"
          onClick={editMode === 'all' ? requestCancel : beginEditAll}
          disabled={editMode === 'section'}
          aria-label={editMode === 'all' ? '取消編輯' : '編輯全部'}
          title={editMode === 'section' ? '請先完成目前區塊' : editMode === 'all' ? '取消編輯' : '編輯全部'}
        >
          {editMode === 'all' ? <CloseIcon size={20} /> : <PencilIcon size={20} />}
        </button>
      </div>

      <div
        className="scroll detail-scroll"
        data-edit-mode={editMode}
        onPointerDown={beginInactiveSectionTap}
        onPointerCancel={() => { inactiveTapStartRef.current = null }}
        onClick={finishInactiveSectionTap}
      >
        {restored && (
          <div className="detail-restored">
            <span>已還原上次未完成的編輯</span>
            <button className="btn btn-sm" onClick={() => setRestored(false)}>知道了</button>
          </div>
        )}

        {seenAiError && (
          <div className="detail-restored detail-ai-error">
            <span>{seenAiError}</span>
            <button
              className="btn btn-sm"
              disabled={Boolean(aiDisabledReason)}
              onClick={() => {
                setSeenAiError('')
                void analyzePlace(itemId)
              }}
            >
              重試
            </button>
            <button className="btn btn-sm" onClick={() => setSeenAiError('')}>知道了</button>
          </div>
        )}

        <section
          data-active={activeSection === 'basic' || undefined}
          className={`detail-section detail-summary${
            editingSections.has('basic') || editMode !== 'none' ? '' : ' detail-section-clickable'
          }${
            editingSections.has('basic') ? ' detail-summary-editing' : ''
          }`}
          {...sectionActionProps('basic')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker"><FlagIcon />基本資訊</span>
          </div>
          {editingSections.has('basic') ? (
            <div className="detail-form-stack">
              <label className="label" htmlFor="d-title">行程名稱</label>
              {mirrored ? (
                <p className="detail-mirrored-value">{item.title || '未命名行程'}</p>
              ) : (
                <input
                  id="d-title"
                  className="field"
                  type="search"
                  enterKeyHint="done"
                  autoComplete="off"
                  style={{ fontSize: 16 }}
                  value={item.title}
                  onChange={(event) => patchItem({ title: event.target.value })}
                  autoFocus={focusSection === 'basic'}
                />
              )}
              <div className="detail-field-row">
                <div className="detail-field detail-field-date">
                  <label className="label" htmlFor="d-date">日期</label>
                  {/*
                    * 同步中的那幾晚是連住排出來的，日期改掉就跟連住的區間對不上 ——
                    * 晚數與退房日都是從這些日期推回來的。時間留著可以改，
                    * 每晚幾點回房本來就各自不同，那不影響連住怎麼算。
                    */}
                  {mirrored ? (
                    <p className="detail-mirrored-value mono">{shortDate(item.date)}</p>
                  ) : (
                    <input
                      id="d-date"
                      className="field mono"
                      type="date"
                      min={trip.startDate}
                      max={trip.endDate}
                      value={item.date}
                      onChange={(event) => {
                        if (event.target.value) patchItem({ date: event.target.value })
                      }}
                    />
                  )}
                </div>
                <div className="detail-field detail-field-time">
                  <label className="label" htmlFor="d-start">時間</label>
                  <input
                    id="d-start"
                    className="field mono"
                    type="search"
                    enterKeyHint="done"
                    autoComplete="off"
                    inputMode="numeric"
                    placeholder="09:10"
                    value={timeDraft}
                    onChange={(event) => {
                      setTouched(true)
                      setTimeDraft(event.target.value)
                    }}
                    onBlur={() => setTimeDraft(normalizeTime(timeDraft) ?? '')}
                  />
                </div>
              </div>
              <div className="detail-field detail-field-map">
                <label className="label" htmlFor="d-map">Google Map</label>
                {mirrored ? (
                  <p className="detail-mirrored-value">
                    {mapLink?.url ? mapLink.label || mapLink.url : '未設定'}
                  </p>
                ) : (
                <div className="link-add-row">
                  <input
                    id="d-map"
                    ref={mapDraftRef}
                    className="field"
                    type="search"
                    enterKeyHint="done"
                    autoComplete="off"
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={mapDraft}
                    placeholder="貼上 Google Maps 網址"
                    /* 自己接手貼上：交給瀏覽器的話換行會被吃掉，地名就黏死在網址上了。 */
                    onPaste={(event) => {
                      event.preventDefault()
                      takeMapPaste(event.clipboardData.getData('text'))
                    }}
                    onChange={(event) => {
                      setTouched(true)
                      setMapDraft(event.target.value)
                      setMapNameDraft('')
                    }}
                  />
                  <button
                    className="btn btn-sm link-paste-btn"
                    aria-label="貼上 Google Map 網址"
                    title="貼上"
                    onClick={() => void pasteLinkDraft('map')}
                  >
                    <PasteIcon />
                  </button>
                  <button
                    className="btn btn-sm delete-icon-btn"
                    aria-label="清除 Google Map 連結"
                    disabled={!mapDraft.trim()}
                    onClick={() => {
                      setTouched(true)
                      setMapDraft('')
                      setMapNameDraft('')
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
                )}
                {linkLookupError && <p className="dim link-lookup-error">{linkLookupError}</p>}
              </div>
              {/*
                * 住宿的兩顆動作藏在編輯狀態的最底下：一趟旅程只按一次，
                * 一直擺在外面會佔著每一筆住宿的版面。已經連住或已經同步的看不到它們。
                * 這裡讀的是已儲存的那一筆，草稿裡還沒存的標題會在儲存時才傳播下去。
                */}
              {isStay && !mirrored && stayFollowers.length === 0 && (
                <div className="detail-stay-buttons">
                  <button className="btn btn-sm" onClick={openCheckout}>新增連住</button>
                  {sourceOptions.length > 0 && (
                    <button className="btn btn-sm" onClick={() => setPickingStaySource(true)}>
                      同步自其他住宿
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="detail-title-row">
                <h2 className="detail-title">{item.title || '未命名行程'}</h2>
                {mapLink?.url && (
                  <a
                    className="detail-map-link"
                    href={mapLink.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="在 Google Maps 開啟"
                    title="在 Google Maps 開啟"
                    /* 這一區未編輯時整塊是 role="button"，不擋冒泡會連帶進入編輯。 */
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MapPinIcon size={17} />
                  </a>
                )}
              </div>
              <div className="detail-meta">
                <span>{shortDate(item.date)}</span>
                <span>{item.startTime || '未設定時間'}</span>
                {hasFlightStatus(item.title) && (
                  <a
                    className="detail-flight"
                    href={flightStatusUrl(item.title)}
                    target="_blank"
                    rel="noreferrer"
                    /* 這一區未編輯時整塊是 role="button"，不擋冒泡會連帶進入編輯。 */
                    onClick={(event) => event.stopPropagation()}
                  >
                    <PlaneIcon size={14} />航班動態
                  </a>
                )}
              </div>
              {/*
                * 連住與同步的狀態接在日期底下，主筆與從筆看到的是同一句話 ——
                * 晚數與退房日一律從主筆算，從筆才知道自己屬於哪一段連住。
                * 按鈕都在這一區裡面，而整區是 role="button"（點了進入編輯），所以要擋冒泡。
                */}
              {stayNights > 0 && (
                <div className="detail-stay-row">
                  <span className="detail-stay-summary">
                    共 {stayNights} 晚 · {stayHead && shortDate(stayHead.date)} 入住
                    {stayHeadCheckout && ` · ${shortDate(stayHeadCheckout)} 退房`}
                  </span>
                  {mirrored ? (
                    <button
                      className="btn btn-sm"
                      disabled={hasEditing}
                      title={hasEditing ? '請先完成或取消編輯' : '解除後內容留在這裡，變成這一筆自己的'}
                      onClick={(event) => {
                        event.stopPropagation()
                        unlinkItem(storedItem.id)
                      }}
                    >
                      解除同步
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      disabled={hasEditing}
                      title={hasEditing ? '請先完成或取消編輯' : '修改退房日'}
                      onClick={(event) => {
                        event.stopPropagation()
                        openCheckout()
                      }}
                    >
                      修改退房日
                    </button>
                  )}
                </div>
              )}
            </>
          )}

        </section>

        <section
          data-active={activeSection === 'category' || undefined}
          className={`detail-section${choosingCategory || editMode !== 'none' ? '' : ' detail-section-clickable'}`}
          {...categoryActionProps}
        >
          <div className="detail-section-head">
            <span className="detail-kicker">
              <TagIcon />行程類型
              {stayLocked && (
                <span
                  className="detail-mirror-chip"
                  title={mirrored ? '同步自其他住宿，不可編輯' : '連住中，不可編輯'}
                >
                  同步
                </span>
              )}
            </span>
          </div>
          {choosingCategory ? (
            <div className="category-picker" role="group" aria-label="行程類型">
              {ITINERARY_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="category-choice"
                  data-on={item.category === category}
                  aria-pressed={item.category === category}
                  onClick={() => selectCategory(category)}
                >
                  <CategoryIcon category={category} />
                  <span>{category}</span>
                </button>
              ))}
              <button
                type="button"
                className="category-choice"
                data-on={!item.category}
                aria-pressed={!item.category}
                onClick={() => selectCategory(undefined)}
              >
                <CategoryIcon />
                <span>未分類</span>
              </button>
            </div>
          ) : (
            <div className="detail-value-action">
              <CategoryIcon category={item.category} size={20} />
              <span>{item.category ?? '未分類'}</span>
            </div>
          )}
        </section>

        <section
          data-active={activeSection === 'guide' || undefined}
          className={`detail-section${
            editingSections.has('guide') || editMode !== 'none' || sectionLocked('guide')
              ? ''
              : ' detail-section-clickable'
          }${sectionLocked('guide') ? ' detail-section-locked' : ''}`}
          {...sectionActionProps('guide')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker">
              <BookIcon />行程說明
              {sectionLocked('guide') && (
                <span className="detail-mirror-chip" title="同步自其他住宿，不可編輯">同步</span>
              )}
            </span>
          </div>
          {editingSections.has('guide') ? (
            /*
             * 點哪一塊就只開哪一格，另一塊照原樣顯示在旁邊：看得到、改不到。
             * guidePart 是 null 時（編輯全部）兩格都開。
             */
            <>
              {guidePart === 'ai' ? (
                guideDraft.own ? (
                  <p className="detail-copy detail-copy-own">{guideDraft.own}</p>
                ) : null
              ) : (
                <textarea
                  ref={guideTextAreaRef}
                  className="field detail-auto-textarea detail-auto-guide"
                  rows={1}
                  value={guideDraft.own}
                  onInput={(event) => autoGrowTextArea(event.currentTarget)}
                  onChange={(event) => patchGuide({ own: event.target.value })}
                  autoFocus={focusSection === 'guide'}
                />
              )}
              {guidePart === 'own' ? (
                guideDraft.ai.trim() ? (
                  <div className="detail-copy detail-copy-ai">
                    <SparkleIcon size={13} className="detail-copy-ai-mark" />
                    {guideDraft.ai}
                  </div>
                ) : null
              ) : guideAiSlot ? (
                <textarea
                  ref={guideAiTextAreaRef}
                  className="field detail-auto-textarea detail-auto-guide detail-auto-guide-ai"
                  rows={1}
                  value={guideDraft.ai}
                  onInput={(event) => autoGrowTextArea(event.currentTarget)}
                  onChange={(event) => patchGuide({ ai: event.target.value })}
                  autoFocus={focusSection === 'guide' && guidePart === 'ai'}
                />
              ) : null}
            </>
          ) : item.guide?.trim() ? (
            // 自己寫的與 AI 寫的分成兩塊，底色不同 —— 一眼看得出哪一段要自己驗證。
            (() => {
              const { own, ai } = splitGuide(item.guide)
              return (
                <>
                  {own && (
                    <p className="detail-copy detail-copy-own" {...guidePartProps('own')}>
                      {own}
                    </p>
                  )}
                  {ai && (
                    <div className="detail-copy detail-copy-ai" {...guidePartProps('ai')}>
                      <SparkleIcon size={13} className="detail-copy-ai-mark" />
                      {ai}
                    </div>
                  )}
                </>
              )
            })()
          ) : (
            <p className="dim detail-empty-copy">-</p>
          )}
        </section>

        <section
          data-active={activeSection === 'notes' || undefined}
          className={`detail-section${
            editingSections.has('notes') || editMode !== 'none' || sectionLocked('notes')
              ? ''
              : ' detail-section-clickable'
          }${sectionLocked('notes') ? ' detail-section-locked' : ''}`}
          {...sectionActionProps('notes')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker">
              <StickyNoteIcon />備註
              {sectionLocked('notes') && (
                <span className="detail-mirror-chip" title="同步自其他住宿，不可編輯">同步</span>
              )}
            </span>
          </div>
          {editingSections.has('notes') ? (
            <>
              {item.notes.map((note, index) => (
                <div
                  key={note.id}
                  className="detail-note-edit-row drag-sort-row"
                  data-keyboard-reveal={index === item.notes.length - 1 ? 'detail-notes-tail' : ''}
                  {...noteSort.rowProps(note.id)}
                >
                  <button {...noteSort.handleProps(note.id)}>
                    <DragHandleIcon />
                  </button>
                  <input
                    className="field"
                    type="search"
                    enterKeyHint="done"
                    autoComplete="off"
                    value={note.text}
                    placeholder="新增提醒或補充"
                    autoFocus={note.id === focusNoteId}
                    onChange={(event) =>
                      patchItem({
                        notes: item.notes.map((value) =>
                          value.id === note.id ? { ...value, text: event.target.value } : value,
                        ),
                      })
                    }
                  />
                  <button
                    className="btn btn-sm delete-icon-btn"
                    aria-label="刪除這筆備註"
                    onClick={() =>
                      patchItem({ notes: item.notes.filter((value) => value.id !== note.id) })
                    }
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
              <button
                className="btn btn-sm detail-add-row"
                data-keyboard-reveal="detail-notes-tail"
                onClick={addNoteCard}
              >
                ＋ 新增備註
              </button>
            </>
          ) : item.notes.length > 0 ? (
            <div className="detail-note-list">
              {item.notes.map((note, index) => (
                <div key={note.id} className="detail-note-row">
                  <span className="detail-note-bullet" aria-hidden="true">•</span>
                  <span className="detail-note-text">{note.text}</span>
                  <label
                    className="detail-overview-toggle"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(note.showInOverview)}
                      onChange={(event) => toggleNoteOverview(note.id, event.target.checked)}
                      aria-label={`在行程總覽顯示備註 ${index + 1}`}
                    />
                    <span>顯示於總覽</span>
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p className="dim detail-empty-copy">-</p>
          )}
        </section>

        <section
          data-active={activeSection === 'links' || undefined}
          className={`detail-section${
            editingSections.has('links') || editMode !== 'none' || sectionLocked('links')
              ? ''
              : ' detail-section-clickable'
          }${sectionLocked('links') ? ' detail-section-locked' : ''}`}
          {...sectionActionProps('links')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker">
              <GlobeIcon />相關連結
              {sectionLocked('links') && (
                <span className="detail-mirror-chip" title="同步自其他住宿，不可編輯">同步</span>
              )}
            </span>
          </div>
          {editingSections.has('links') ? (
            <>
              {webLinks.map((link, index) => (
                link.url ? (
                  <div
                    key={link.id}
                    className="link-edit-row drag-sort-row"
                    data-keyboard-reveal={index === webLinks.length - 1 ? 'detail-links-tail' : ''}
                    {...linkSort.rowProps(link.id)}
                  >
                    <button {...linkSort.handleProps(link.id)}>
                      <DragHandleIcon />
                    </button>
                    <input
                      className="field"
                      type="search"
                      enterKeyHint="done"
                      autoComplete="off"
                      style={{ flex: 1, minWidth: 0 }}
                      value={link.label}
                      placeholder={link.url}
                      onChange={(event) =>
                        patchItem({
                          links: item.links.map((value) =>
                            value.id === link.id ? { ...value, label: event.target.value } : value,
                          ),
                        })
                      }
                    />
                    <a
                      className="btn btn-sm link-icon-btn"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="開啟連結"
                    >
                      <ExternalLinkIcon />
                    </a>
                    <button
                      className="btn btn-sm delete-icon-btn"
                      aria-label="刪除這個連結"
                      onClick={() =>
                        patchItem({ links: item.links.filter((value) => value.id !== link.id) })
                      }
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ) : (
                  <div
                    key={link.id}
                    className="link-add-row drag-sort-row"
                    data-keyboard-reveal={index === webLinks.length - 1 ? 'detail-links-tail' : ''}
                    {...linkSort.rowProps(link.id)}
                  >
                    <button {...linkSort.handleProps(link.id)}>
                      <DragHandleIcon />
                    </button>
                    <input
                      id={`web-link-${link.id}`}
                      className="field"
                      type="search"
                      enterKeyHint="done"
                      autoComplete="off"
                      inputMode="url"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={link.label}
                      placeholder="貼上訂位、票券或網站網址"
                      autoFocus={link.id === focusLinkId}
                      onChange={(event) =>
                        patchItem({
                          links: item.links.map((value) =>
                            value.id === link.id ? { ...value, label: event.target.value } : value,
                          ),
                        })
                      }
                    />
                    <button
                      className="btn btn-sm link-paste-btn"
                      aria-label="貼上相關連結網址"
                      title="貼上"
                      onClick={() => void pasteLinkDraft('web', link.id)}
                    >
                      <PasteIcon />
                    </button>
                    <button
                      className="btn btn-sm delete-icon-btn"
                      aria-label="刪除這個連結"
                      onClick={() =>
                        patchItem({ links: item.links.filter((value) => value.id !== link.id) })
                      }
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )
              ))}
              <button
                className="btn btn-sm detail-add-row"
                data-keyboard-reveal="detail-links-tail"
                onClick={addWebLinkCard}
              >
                ＋ 新增連結
              </button>
              {linkLookupError && <p className="dim link-lookup-error">{linkLookupError}</p>}
            </>
          ) : webLinks.length > 0 ? (
            <div className="detail-link-list">
              {webLinks.map((link) => (
                <div key={link.id} className="detail-link-card">
                  <div className="detail-link-content">
                    <span className="detail-link-icon"><LinkIcon size={15} /></span>
                    <span className="detail-link-label">{link.label || link.url}</span>
                  </div>
                  <a
                    className="btn btn-sm detail-link-external"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    開啟連結
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="dim detail-empty-copy">-</p>
          )}
        </section>

        <section
          data-active={activeSection === 'costs' || undefined}
          className={`detail-section${
            editingSections.has('costs') || editMode !== 'none' ? '' : ' detail-section-clickable'
          }`}
          {...sectionActionProps('costs')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker"><MoneyIcon />費用</span>
          </div>
          {editingSections.has('costs') ? (
            <>
              {item.costs.map((cost, index) => (
                <div
                  key={cost.id}
                  className="costline"
                  data-keyboard-reveal={index === item.costs.length - 1 ? 'detail-costs-tail' : ''}
                >
                  <div className="costline-head">
                    <input
                      className="field cl-label"
                      type="search"
                      enterKeyHint="done"
                      autoComplete="off"
                      placeholder="項目"
                      value={cost.label}
                      autoFocus={cost.id === focusCostId}
                      onChange={(event) => patchCost(cost.id, { label: event.target.value })}
                    />
                    <button
                      className="btn btn-sm delete-icon-btn"
                      aria-label="刪除這筆費用"
                      onClick={() =>
                        patchItem({ costs: item.costs.filter((value) => value.id !== cost.id) })
                      }
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  <NumberField
                    className="field mono cl-price"
                    value={cost.unitPrice}
                    emptyAs={0}
                    onChange={(value) => patchCost(cost.id, { unitPrice: value ?? 0 })}
                    aria-label="單價"
                  />
                  <span className="dim costline-times">×</span>
                  <NumberField
                    className="field mono cl-qty"
                    value={cost.qty}
                    emptyAs={0}
                    onChange={(value) => patchCost(cost.id, { qty: value ?? 0 })}
                    aria-label="數量"
                  />
                  <div className="seg" role="group" aria-label="幣別">
                    {[trip.foreignCurrency, trip.homeCurrency].map((code) => (
                      <button
                        key={code}
                        className="seg-btn seg-btn-sm"
                        aria-pressed={cost.currency === code}
                        onClick={() => patchCost(cost.id, { currency: code })}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                  <span className="mono dim cl-sub">{formatMoney(lineTotal(cost), cost.currency)}</span>
                </div>
              ))}
              <button
                className="btn btn-sm detail-add-row"
                data-keyboard-reveal="detail-costs-tail"
                onClick={addCost}
              >
                ＋ 新增費用
              </button>
              {item.costs.length > 0 && (
                <div className="detail-total-row">
                  <strong>合計</strong>
                  <span className="mono">
                    {formatTotals(totals) || formatMoney(0, trip.foreignCurrency)}
                    {showConverted && <span className="dim"> ≈ {formatMoney(home, trip.homeCurrency)}</span>}
                  </span>
                </div>
              )}
            </>
          ) : item.costs.length > 0 ? (
            <>
              <div className="detail-cost-summary">
                <span>{item.costs.length} 筆費用總價</span>
                <strong className="mono">{formatTotals(totals) || formatMoney(0, trip.foreignCurrency)}</strong>
              </div>
              <div className="detail-cost-list">
                {item.costs.map((cost) => (
                  <div key={cost.id} className="detail-cost-row">
                    <span>{cost.label || '未命名費用'}</span>
                    <span className="dim mono">{formatMoney(cost.unitPrice, cost.currency)}</span>
                    <span className="dim mono">× {cost.qty}</span>
                    <span className="mono">{formatMoney(lineTotal(cost), cost.currency)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="dim detail-empty-copy">-</p>
          )}

          {splitHint && (
            <div className="detail-split-hint">
              <div>
                分成 {splitHint.splits} 筆各 {formatMoney(splitHint.each, splitHint.currency)}
                {splitHint.currency === trip.homeCurrency && totals[trip.foreignCurrency] !== undefined && (
                  <span>（約 {formatMoney(splitHint.each / trip.rate, trip.foreignCurrency)}）</span>
                )}
                ，可多拿 {formatMoney(splitHint.gain, splitHint.currency)} 回饋
              </div>
              <p>這張卡有單筆回饋上限，一次刷完會有一部分拿不到。</p>
            </div>
          )}
        </section>

        <section
          className={`detail-section detail-payment-section${
            editMode === 'section' ? '' : ' detail-section-clickable'
          }`}
          {...paymentActionProps}
        >
          <div className="detail-section-head">
            <span className="detail-kicker"><RewardsIcon size={14} />支付方式</span>
            <span
              className="detail-payment-value"
              data-empty={!hasPickedMethod || undefined}
              aria-hidden="true"
            >
              {hasPickedMethod ? pickedMethodLabel : '-'}
            </span>
          </div>
        </section>

        {isActual && <PhotoSection trip={trip} itemId={item.id} kind="receipt" />}

        {isActual && <PhotoSection trip={trip} itemId={item.id} kind="trip" />}

        {isActual && (
          <section
            data-active={activeSection === 'review' || undefined}
            className={`detail-section${
              editingSections.has('review') || editMode !== 'none' ? '' : ' detail-section-clickable'
            }`}
            {...sectionActionProps('review')}
          >
            <div className="detail-section-head">
              <span className="detail-kicker"><ReviewIcon />心得</span>
            </div>
            {others.map((review) => (
              <div
                key={review.id}
                className="detail-review detail-review-colored review-hue"
                data-hue={reviewHues?.[review.author]}
              >
                <span className="review-tag" title={review.author}>{tagCharOf(review.author)}</span>
                <p>{review.text}</p>
              </div>
            ))}
            {editingSections.has('review') ? (
              <>
                <button className="detail-author" onClick={() => setRenaming(true)}>{me} · 改名</button>
                <textarea
                  ref={reviewTextAreaRef}
                  className="field detail-auto-textarea detail-auto-review"
                  rows={1}
                  placeholder="實際去了之後的感想"
                  value={reviewDraft}
                  onInput={(event) => autoGrowTextArea(event.currentTarget)}
                  onChange={(event) => {
                    setTouched(true)
                    setReviewDraft(event.target.value)
                  }}
                  autoFocus={focusSection === 'review'}
                />
              </>
            ) : mine?.text.trim() ? (
              <div
                className="detail-review detail-review-colored review-hue"
                data-hue={reviewHues?.[me]}
              >
                <span className="review-tag" title={me}>{tagCharOf(me)}</span>
                <p>{mine.text}</p>
              </div>
            ) : (
              <p className="dim detail-empty-copy">-</p>
            )}
          </section>
        )}

      </div>

      {/*
        * 沒在編輯時只剩「關閉」可按，而手機是用右滑返回的 ——
        * 那條按鈕列只留給沒有手勢的桌機，手機不算繪，不留一條空的橫條。
        */}
      {editMode === 'all' ? (
        <div className="editor-actions">
          <button className="btn" onClick={requestCancel}>取消</button>
          <button
            className="btn btn-primary"
            onClick={() => void completeEditing()}
            disabled={!dirty || resolvingLink !== null}
          >
            {resolvingLink ? (resolvingLink === 'map' ? '解析中…' : '讀取中…') : '儲存'}
          </button>
        </div>
      ) : editMode === 'section' ? (
        <div className="editor-actions">
          <button
            className={`btn${sectionAction ? '' : ' detail-leave-wide'}`}
            onClick={requestCancel}
          >
            取消
          </button>
          {sectionAction && (
            <button
              className="btn btn-primary"
              onClick={sectionAction.run}
              disabled={sectionAction.disabled}
            >
              {resolvingLink ? (resolvingLink === 'map' ? '解析中…' : '讀取中…') : '儲存'}
            </button>
          )}
        </div>
      ) : (
        <div className="editor-actions wide-only">
          <button className="btn detail-leave-wide" onClick={requestCancel}>關閉</button>
        </div>
      )}
    </>
  )
}
