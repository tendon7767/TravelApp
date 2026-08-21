import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
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
import { makeLink } from '../lib/maps'
import { formatMoney, formatTotals, lineTotal, sumByCurrency, toHome } from '../lib/money'
import { normalizeTime, shortDate } from '../lib/date'
import { isSubmitEnter } from '../lib/keys'
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
import MoneyIcon from './MoneyIcon'
import MapIcon from './MapIcon'
import GlobeIcon from './GlobeIcon'
import ReviewIcon from './ReviewIcon'
import FlagIcon from './FlagIcon'
import TagIcon from './TagIcon'
import BookIcon from './BookIcon'
import StickyNoteIcon from './StickyNoteIcon'
import { fetchLinkMetadata } from '../sync/client'
import { copyItemSnapshot } from '../lib/items'
import { flightStatusUrl, hasFlightStatus } from '../lib/flight'
import PlaneIcon from './PlaneIcon'
import PhotoSection from './PhotoSection'

interface Props {
  trip: Trip
  itemId: string
  onClose: () => void
  onCopy: (item: Item) => void
  onDirtyChange: (dirty: boolean) => void
}

const SECTION_LABELS: Record<ItemDraftSection, string> = {
  basic: '基本資訊',
  guide: '行程說明',
  map: 'Google Map',
  notes: '備註',
  links: '相關連結',
  costs: '費用',
  review: '心得',
}

// 按「新增一筆費用」（或空白費用按鉛筆）會先長出一列空的，使用者什麼都沒填就取消時
// 不該被當成有未儲存變更；比對與儲存前都把這種空列濾掉。
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

export default function ItemDetail({ trip, itemId, onClose, onCopy, onDirtyChange }: Props) {
  const storedItem = useStore((state) => state.data.items.find((item) => item.id === itemId))
  const updateItem = useStore((state) => state.updateItem)
  const removeItem = useStore((state) => state.removeItem)
  const allPayments = useStore((state) => state.data.payments)
  const allItems = useStore((state) => state.data.items)
  const allReviews = useStore((state) => state.data.reviews)
  const setReview = useStore((state) => state.setReview)
  const me = useStore((state) => state.settings.memberName)
  const gasUrl = useStore((state) => state.settings.gasUrl)
  const ruleFocus = useStore((state) => state.settings.rewardRuleFocus)
  const tripLink = useStore((state) => state.settings.tripLinks?.[trip.id])
  const isActual = useStore((state) =>
    state.data.plans.some(
      (plan) => plan.id === storedItem?.planId && plan.kind === 'actual' && !plan.deleted,
    ),
  )

  const [editingSections, setEditingSections] = useState<Set<ItemDraftSection>>(() => new Set())
  /**
   * 哪個區塊該拿到游標。每個區塊各自寫死 autoFocus 的話，「編輯全部」一次展開全部，
   * 最後掛上的心得欄位會搶走焦點，整個畫面被拖到最下面。
   */
  const [focusSection, setFocusSection] = useState<ItemDraftSection | null>(null)
  const [draftItem, setDraftItem] = useState(() => copyItemSnapshot(storedItem))
  const [timeDraft, setTimeDraft] = useState(storedItem?.startTime ?? '')
  const [reviewDraft, setReviewDraft] = useState('')
  const [mapDraft, setMapDraft] = useState('')
  const [webDraft, setWebDraft] = useState('')
  const [resolvingLink, setResolvingLink] = useState<LinkRef['kind'] | null>(null)
  const [linkLookupError, setLinkLookupError] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [focusLinkId, setFocusLinkId] = useState<string | null>(null)
  const [choosingCategory, setChoosingCategory] = useState(false)
  const [pickingPayment, setPickingPayment] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [restored, setRestored] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [touched, setTouched] = useState(false)

  const reviews = useMemo(
    () => allReviews.filter((review) => review.itemId === itemId && !review.deleted),
    [allReviews, itemId],
  )
  const mine = reviews.find((review) => review.author === me)
  const others = reviews.filter((review) => review.author !== me && review.text.trim())
  const initialReviewText = useRef(mine?.text ?? '')
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
      item.paymentMethodId !== storedItem.paymentMethodId ||
      JSON.stringify(item.notes) !== JSON.stringify(storedItem.notes) ||
      JSON.stringify(item.links) !== JSON.stringify(storedItem.links) ||
      JSON.stringify(filledCosts(item.costs)) !== JSON.stringify(filledCosts(storedItem.costs))
    )
  }, [item, storedItem, timeDraft])
  const dirty = itemDirty || reviewDraft !== (mine?.text ?? '')

  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    let cancelled = false
    void loadItemDraft(itemId).then((saved) => {
      if (cancelled) return
      if (saved) {
        setDraftItem(saved.item)
        setTimeDraft(saved.timeDraft)
        setReviewDraft(saved.reviewDraft)
        setEditingSections(new Set(saved.sections ?? (saved.section ? [saved.section] : [])))
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
        sections: [...editingSections],
      })
    }
    else void clearItemDraft(itemId)
  }, [hydrated, editingSections, dirty, item, itemId, timeDraft, reviewDraft])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!item || !storedItem || item.deleted) return <div className="empty">項目已刪除。</div>

  const totals = sumByCurrency(item.costs)
  const home = toHome(totals, trip)
  const showConverted = !totals[trip.homeCurrency] || Object.keys(totals).length > 1
  const mapLinks = item.links.filter((link) => link.kind === 'map')
  const webLinks = item.links.filter((link) => link.kind === 'web')

  const patchItem = (patch: Partial<Item>) => {
    setTouched(true)
    setDraftItem((current) => (current ? { ...current, ...patch } : current))
  }

  const beginEdit = (section: ItemDraftSection) => {
    // 空白費用按鉛筆後直接得到第一列，不必再多按一次「新增一筆」。
    if (section === 'costs' && item.costs.length === 0) {
      patchItem({
        costs: [
          { id: newId(), label: '', unitPrice: 0, qty: 1, currency: trip.foreignCurrency },
        ],
      })
    }
    setFocusLinkId(null)
    setRestored(false)
    setFocusSection(section)
    setEditingSections((current) => new Set(current).add(section))
  }

  const editableSections: ItemDraftSection[] = [
    'basic',
    'guide',
    'map',
    'notes',
    'costs',
    'links',
    ...(isActual ? (['review'] as const) : []),
  ]
  const allSectionsOpen = editableSections.every((section) => editingSections.has(section))
  // 行程類型、總覽勾選與支付方式不一定會展開區塊；只要已有草稿，也算編輯狀態。
  const hasEditing = editingSections.size > 0 || choosingCategory || dirty

  const beginEditAll = () => {
    setFocusLinkId(null)
    setRestored(false)
    setChoosingCategory(true)
    // 展開全部時焦點固定回標題，它在最上面，畫面不會被拉走。
    setFocusSection('basic')
    setEditingSections(new Set(editableSections))
  }

  const sectionActionProps = (section: ItemDraftSection) => {
    if (editingSections.has(section)) return {}
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

  const beginEditCategory = () => {
    setFocusLinkId(null)
    setRestored(false)
    setChoosingCategory(true)
  }

  // 行程類型自成一個區塊，點整塊任何位置都是改類型，不會誤觸基本資訊。
  const categoryActionProps = choosingCategory
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
    setTimeDraft(storedItem.startTime ?? '')
    setReviewDraft(mine?.text ?? '')
    setMapDraft('')
    setWebDraft('')
    setNoteDraft('')
    setEditingSections(new Set())
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

  const completeEditing = () => {
    const normalizedTime = normalizeTime(timeDraft)
    if (itemDirty) {
      updateItem(item.id, {
        date: item.date,
        startTime: normalizedTime,
        title: item.title,
        guide: item.guide,
        category: item.category,
        paymentMethodId: item.paymentMethodId,
        notes: item.notes,
        links: item.links,
        costs: filledCosts(item.costs),
      })
    }
    if (isActual && reviewDraft !== (mine?.text ?? '')) setReview(item.id, reviewDraft)
    setTimeDraft(normalizedTime ?? '')
    setMapDraft('')
    setWebDraft('')
    setNoteDraft('')
    setEditingSections(new Set())
    setFocusSection(null)
    setChoosingCategory(false)
    setTouched(false)
    setRestored(false)
    void clearItemDraft(item.id)
  }

  const selectCategory = (category?: ItineraryCategory) => {
    patchItem({ category })
    setChoosingCategory(false)
  }

  const selectPayment = (paymentMethodId?: string) => {
    patchItem({ paymentMethodId })
  }

  const toggleNoteOverview = (noteId: string, checked: boolean) => {
    patchItem({
      notes: item.notes.map((note) =>
        note.id === noteId ? { ...note, showInOverview: checked || undefined } : note,
      ),
    })
  }

  const patchCost = (id: string, patch: Partial<CostLine>) =>
    patchItem({ costs: item.costs.map((cost) => (cost.id === id ? { ...cost, ...patch } : cost)) })

  const addCost = () =>
    patchItem({
      costs: [
        ...item.costs,
        { id: newId(), label: '', unitPrice: 0, qty: 1, currency: trip.foreignCurrency },
      ],
    })

  const addLink = async (kind: LinkRef['kind']) => {
    const value = kind === 'map' ? mapDraft : webDraft
    if (!value.trim() || resolvingLink) return
    if (kind === 'map' && item.links.some((link) => link.kind === 'map')) return
    const parsed = { ...makeLink(value), kind }
    let link = parsed
    setLinkLookupError('')

    if (gasUrl && tripLink && /^https?:\/\//i.test(parsed.url)) {
      setResolvingLink(kind)
      try {
        const metadata = await fetchLinkMetadata(gasUrl, tripLink, parsed.url)
        link = {
          ...parsed,
          url: metadata.url || parsed.url,
          label: metadata.label.trim() || parsed.label || (kind === 'map' ? item.title : ''),
        }
      } catch {
        setLinkLookupError('無法讀取連結名稱，已使用預設備援名稱。')
      } finally {
        setResolvingLink(null)
      }
    }
    if (!link.label && kind === 'map') link = { ...link, label: item.title }
    patchItem({ links: [...item.links, link] })
    if (kind === 'map') setMapDraft('')
    else setWebDraft('')
    if (!link.label) setFocusLinkId(link.id)
  }

  const addNote = () => {
    if (!noteDraft.trim()) return
    patchItem({ notes: [...item.notes, { id: newId(), text: noteDraft.trim() }] })
    setNoteDraft('')
  }

  const pickedMethod = methods.find((payment) => payment.id === item.paymentMethodId)

  const paymentPicker = item.costs.length > 0 && (
    <div className="detail-payment-row" onClick={(event) => event.stopPropagation()}>
      <span className="detail-key">支付方式</span>
      <button className="btn btn-sm detail-payment-pick" onClick={() => setPickingPayment(true)}>
        <span className="detail-payment-name">
          {pickedMethod
            ? methodLabel(pickedMethod.name, pickedMethod.owner)
            : (OTHER_PAYMENTS.find(([id]) => id === item.paymentMethodId)?.[1] ?? '未設定')}
        </span>
        <span aria-hidden="true">›</span>
      </button>
    </div>
  )

  const choosePayment = (id?: string) => {
    selectPayment(id)
    setPickingPayment(false)
  }

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
            {hasEditing
              ? '確定要取消編輯並放棄這次的全部修改嗎？'
              : '確定要離開並放棄這次的全部修改嗎？'}
          </p>
        </Modal>
      )}
      {renaming && <SettingsModal onClose={() => setRenaming(false)} />}
      {paymentModal}

      <div className="topbar detail-head">
        <button
          className="btn btn-sm btn-glyph btn-plain"
          onClick={requestCancel}
          aria-label="返回行程列表"
        >
          <BackIcon size={22} />
        </button>
        <span className="detail-head-gap" />
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
          onClick={allSectionsOpen ? requestCancel : beginEditAll}
          aria-label={allSectionsOpen ? '取消編輯' : '編輯全部'}
          title={allSectionsOpen ? '取消編輯' : '編輯全部'}
        >
          {allSectionsOpen ? <CloseIcon size={20} /> : <PencilIcon size={20} />}
        </button>
      </div>

      <div className="scroll detail-scroll">
        {restored && (
          <div className="detail-restored">
            <span>已還原上次未完成的編輯</span>
            <button className="btn btn-sm" onClick={() => setRestored(false)}>知道了</button>
          </div>
        )}

        <section
          className={`detail-section detail-summary${
            editingSections.has('basic') ? '' : ' detail-section-clickable'
          }`}
          {...sectionActionProps('basic')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker"><FlagIcon />基本資訊</span>
          </div>
          {editingSections.has('basic') ? (
            <div className="detail-form-stack">
              <label className="label" htmlFor="d-title">行程名稱</label>
              <input
                id="d-title"
                className="field"
                autoComplete="off"
                style={{ fontSize: 16 }}
                value={item.title}
                onChange={(event) => patchItem({ title: event.target.value })}
                autoFocus={focusSection === 'basic'}
              />
              <div className="detail-field-row">
                <div className="detail-field detail-field-date">
                  <label className="label" htmlFor="d-date">日期</label>
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
                </div>
                <div className="detail-field detail-field-time">
                  <label className="label" htmlFor="d-start">時間</label>
                  <input
                    id="d-start"
                    className="field mono"
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
            </div>
          ) : (
            <>
              <h2 className="detail-title">{item.title || '未命名行程'}</h2>
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
            </>
          )}

        </section>

        <section
          className={`detail-section${choosingCategory ? '' : ' detail-section-clickable'}`}
          {...categoryActionProps}
        >
          <div className="detail-section-head">
            <span className="detail-kicker"><TagIcon />行程類型</span>
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
          className={`detail-section${
            editingSections.has('guide') ? '' : ' detail-section-clickable'
          }`}
          {...sectionActionProps('guide')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker"><BookIcon />行程說明</span>
          </div>
          {editingSections.has('guide') ? (
            <textarea
              className="field"
              rows={5}
              value={item.guide ?? ''}
              onChange={(event) => patchItem({ guide: event.target.value })}
              autoFocus={focusSection === 'guide'}
            />
          ) : item.guide?.trim() ? (
            <p className="detail-copy">{item.guide}</p>
          ) : (
            <p className="dim detail-empty-copy">-</p>
          )}
        </section>

        <section
          className={`detail-section${
            editingSections.has('notes') ? '' : ' detail-section-clickable'
          }`}
          {...sectionActionProps('notes')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker"><StickyNoteIcon />備註</span>
          </div>
          {editingSections.has('notes') ? (
            <>
              {item.notes.map((note, index) => (
                <div key={note.id} className="detail-note-edit-row">
                  <span className="detail-note-bullet" aria-hidden="true">•</span>
                  <input
                    className="field"
                    autoComplete="off"
                    value={note.text}
                    onChange={(event) =>
                      patchItem({
                        notes: item.notes.map((value) =>
                          value.id === note.id ? { ...value, text: event.target.value } : value,
                        ),
                      })
                    }
                  />
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
              <div className="link-add-row">
                <input
                  className="field"
                  autoComplete="off"
                  value={noteDraft}
                  placeholder="新增提醒或補充"
                  autoFocus={focusSection === 'notes' && item.notes.length === 0}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  onKeyDown={(event) => isSubmitEnter(event) && addNote()}
                />
                <button className="btn" onClick={addNote}>加入</button>
              </div>
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
          className={`detail-section${
            editingSections.has('costs') ? '' : ' detail-section-clickable'
          }`}
          {...sectionActionProps('costs')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker"><MoneyIcon />費用</span>
          </div>
          {editingSections.has('costs') ? (
            <>
              {item.costs.map((cost) => (
                <div key={cost.id} className="costline">
                  <div className="costline-head">
                    <input
                      className="field cl-label"
                      autoComplete="off"
                      placeholder="項目"
                      value={cost.label}
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
                    className="field mono"
                    style={{ width: 76 }}
                    value={cost.unitPrice}
                    emptyAs={0}
                    onChange={(value) => patchCost(cost.id, { unitPrice: value ?? 0 })}
                    aria-label="單價"
                  />
                  <span className="dim">×</span>
                  <NumberField
                    className="field mono"
                    style={{ width: 52 }}
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
              <button className="btn btn-sm" onClick={addCost}>新增一筆</button>
              {item.costs.length > 0 && (
                <div className="detail-total-row">
                  <strong>合計</strong>
                  <span className="mono">
                    {formatTotals(totals) || formatMoney(0, trip.foreignCurrency)}
                    {showConverted && <span className="dim"> ≈ {formatMoney(home, trip.homeCurrency)}</span>}
                  </span>
                </div>
              )}
              {paymentPicker}
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
              {paymentPicker}
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

        {isActual && <PhotoSection trip={trip} itemId={item.id} kind="receipt" />}

        <section
          className={`detail-section${
            editingSections.has('map') ? '' : ' detail-section-clickable'
          }`}
          {...sectionActionProps('map')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker"><MapIcon />Google Map</span>
          </div>
          {editingSections.has('map') ? (
            <>
              {mapLinks.map((link) => (
                <div key={link.id} className="link-edit-row">
                  <input
                    className="field"
                    autoComplete="off"
                    style={{ flex: 1, minWidth: 0 }}
                    value={link.label}
                    placeholder={link.url}
                    autoFocus={link.id === focusLinkId}
                    onChange={(event) =>
                      patchItem({
                        links: item.links.map((value) =>
                          value.id === link.id ? { ...value, label: event.target.value } : value,
                        ),
                      })
                    }
                  />
                  <a className="btn btn-sm" href={link.url} target="_blank" rel="noreferrer">開啟</a>
                  <button
                    className="btn btn-sm delete-icon-btn"
                    aria-label="刪除 Google Map"
                    onClick={() =>
                      patchItem({ links: item.links.filter((value) => value.id !== link.id) })
                    }
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
              {mapLinks.length === 0 && (
                <div className="link-add-row">
                  <input
                    className="field"
                    autoComplete="off"
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={mapDraft}
                    placeholder="貼上 Google Maps 網址"
                    autoFocus={focusSection === 'map'}
                    onChange={(event) => setMapDraft(event.target.value)}
                    onKeyDown={(event) => isSubmitEnter(event) && void addLink('map')}
                  />
                  <button
                    className="btn"
                    disabled={resolvingLink !== null}
                    onClick={() => void addLink('map')}
                  >
                    {resolvingLink === 'map' ? '解析中…' : '加入'}
                  </button>
                </div>
              )}
              {linkLookupError && <p className="dim link-lookup-error">{linkLookupError}</p>}
            </>
          ) : mapLinks.length > 0 ? (
            mapLinks.map((link) => (
              <div key={link.id} className="detail-link-card">
                <a
                  className="detail-link-open"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="detail-link-icon"><MapPinIcon size={16} /></span>
                  <span className="detail-link-label">{link.label || 'Google Map 地點'}</span>
                </a>
                <button
                  className="detail-link-edit"
                  aria-label="編輯 Google Map"
                  onClick={(event) => {
                    event.stopPropagation()
                    beginEdit('map')
                  }}
                >
                  <PencilIcon />
                </button>
              </div>
            ))
          ) : (
            <p className="dim detail-empty-copy">-</p>
          )}
        </section>

        <section
          className={`detail-section${
            editingSections.has('links') ? '' : ' detail-section-clickable'
          }`}
          {...sectionActionProps('links')}
        >
          <div className="detail-section-head">
            <span className="detail-kicker"><GlobeIcon />相關連結</span>
          </div>
          {editingSections.has('links') ? (
            <>
              {webLinks.map((link) => (
                <div key={link.id} className="link-edit-row">
                  <input
                    className="field"
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
                  <a className="btn btn-sm" href={link.url} target="_blank" rel="noreferrer">開啟</a>
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
              ))}
              <div className="link-add-row">
                <input
                  className="field"
                  autoComplete="off"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={webDraft}
                  placeholder="貼上訂位、票券或網站網址"
                  autoFocus={focusSection === 'links' && webLinks.length === 0}
                  onChange={(event) => setWebDraft(event.target.value)}
                  onKeyDown={(event) => isSubmitEnter(event) && void addLink('web')}
                />
                <button
                  className="btn"
                  disabled={resolvingLink !== null}
                  onClick={() => void addLink('web')}
                >
                  {resolvingLink === 'web' ? '讀取中…' : '加入'}
                </button>
              </div>
              {linkLookupError && <p className="dim link-lookup-error">{linkLookupError}</p>}
            </>
          ) : webLinks.length > 0 ? (
            <div className="detail-link-list">
              {webLinks.map((link) => (
                <div key={link.id} className="detail-link-card">
                  <a
                    className="detail-link-open"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="detail-link-icon"><LinkIcon size={15} /></span>
                    <span className="detail-link-label">{link.label || link.url}</span>
                  </a>
                  <button
                    className="detail-link-edit"
                    aria-label="編輯這個連結"
                    onClick={(event) => {
                      event.stopPropagation()
                      beginEdit('links')
                    }}
                  >
                    <PencilIcon />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="dim detail-empty-copy">-</p>
          )}
        </section>

        {isActual && (
          <section
            className={`detail-section${
              editingSections.has('review') ? '' : ' detail-section-clickable'
            }`}
            {...sectionActionProps('review')}
          >
            <div className="detail-section-head">
              <span className="detail-kicker"><ReviewIcon />旅程紀錄／心得</span>
            </div>
            {others.map((review) => (
              <div key={review.id} className="detail-review">
                <span className="detail-key">{review.author}</span>
                <p>{review.text}</p>
              </div>
            ))}
            {editingSections.has('review') ? (
              <>
                <button className="detail-author" onClick={() => setRenaming(true)}>{me} · 改名</button>
                <textarea
                  className="field"
                  rows={4}
                  placeholder="實際去了之後的感想"
                  value={reviewDraft}
                  onChange={(event) => {
                    setTouched(true)
                    setReviewDraft(event.target.value)
                  }}
                  autoFocus={focusSection === 'review'}
                />
              </>
            ) : mine?.text.trim() ? (
              <div className="detail-review">
                <span className="detail-key">{me}</span>
                <p>{mine.text}</p>
              </div>
            ) : (
              <p className="dim detail-empty-copy">-</p>
            )}
          </section>
        )}

        {isActual && <PhotoSection trip={trip} itemId={item.id} kind="trip" />}
      </div>

      {/*
        * 沒在編輯時只剩「離開」可按，而手機是用右滑返回的 ——
        * 那條按鈕列只留給沒有手勢的桌機，手機不算繪，不留一條空的橫條。
        */}
      {hasEditing ? (
        <div className="editor-actions">
          <button className="btn" onClick={requestCancel}>取消編輯</button>
          <button className="btn btn-primary" onClick={completeEditing} disabled={!dirty}>
            完成編輯
          </button>
        </div>
      ) : (
        <div className="editor-actions wide-only">
          <button className="btn detail-leave-wide" onClick={requestCancel}>離開</button>
        </div>
      )}
    </>
  )
}
