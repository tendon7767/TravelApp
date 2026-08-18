import { useEffect, useMemo, useState } from 'react'
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
import { methodLabel } from '../lib/owners'
import SettingsModal from './SettingsModal'
import Modal from './Modal'
import { amountInMethodCurrency, computeMethod, suggestSplit } from '../lib/rewards'
import {
  clearItemDraft,
  loadItemDraft,
  saveItemDraft,
  type ItemDraftSection,
} from '../store/drafts'
import CategoryIcon from './CategoryIcon'

interface Props {
  trip: Trip
  itemId: string
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
}

const copyItem = (item?: Item): Item | undefined =>
  item
    ? {
        ...item,
        notes: item.notes.map((note) => ({ ...note })),
        links: item.links.map((link) => ({ ...link })),
        costs: item.costs.map((cost) => ({ ...cost })),
      }
    : undefined

const sameLinks = (a: LinkRef[], b: LinkRef[], kind: LinkRef['kind']) =>
  JSON.stringify(a.filter((link) => link.kind === kind)) ===
  JSON.stringify(b.filter((link) => link.kind === kind))

export default function ItemDetail({ trip, itemId, onClose, onDirtyChange }: Props) {
  const storedItem = useStore((state) => state.data.items.find((item) => item.id === itemId))
  const updateItem = useStore((state) => state.updateItem)
  const removeItem = useStore((state) => state.removeItem)
  const allPayments = useStore((state) => state.data.payments)
  const allItems = useStore((state) => state.data.items)
  const allReviews = useStore((state) => state.data.reviews)
  const setReview = useStore((state) => state.setReview)
  const me = useStore((state) => state.settings.memberName)
  const isActual = useStore((state) =>
    state.data.plans.some(
      (plan) => plan.id === storedItem?.planId && plan.kind === 'actual' && !plan.deleted,
    ),
  )

  const [editing, setEditing] = useState<ItemDraftSection | null>(null)
  const [draftItem, setDraftItem] = useState(() => copyItem(storedItem))
  const [timeDraft, setTimeDraft] = useState(storedItem?.startTime ?? '')
  const [reviewDraft, setReviewDraft] = useState('')
  const [mapDraft, setMapDraft] = useState('')
  const [webDraft, setWebDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [focusLinkId, setFocusLinkId] = useState<string | null>(null)
  const [choosingCategory, setChoosingCategory] = useState(false)
  const [costExpanded, setCostExpanded] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [restored, setRestored] = useState(false)
  const [legacyDraft, setLegacyDraft] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const reviews = useMemo(
    () => allReviews.filter((review) => review.itemId === itemId && !review.deleted),
    [allReviews, itemId],
  )
  const mine = reviews.find((review) => review.author === me)
  const others = reviews.filter((review) => review.author !== me && review.text.trim())
  const item = editing && draftItem?.id === storedItem?.id ? draftItem : storedItem

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

  const dirty = useMemo(() => {
    if (!editing || !item || !storedItem) return false
    if (legacyDraft) {
      return (
        item.title !== storedItem.title ||
        normalizeTime(timeDraft) !== normalizeTime(storedItem.startTime ?? '') ||
        (item.guide ?? '') !== (storedItem.guide ?? '') ||
        item.category !== storedItem.category ||
        item.paymentMethodId !== storedItem.paymentMethodId ||
        JSON.stringify(item.notes) !== JSON.stringify(storedItem.notes) ||
        JSON.stringify(item.links) !== JSON.stringify(storedItem.links) ||
        JSON.stringify(item.costs) !== JSON.stringify(storedItem.costs) ||
        reviewDraft !== (mine?.text ?? '')
      )
    }

    switch (editing) {
      case 'basic':
        return (
          item.title !== storedItem.title ||
          normalizeTime(timeDraft) !== normalizeTime(storedItem.startTime ?? '')
        )
      case 'guide':
        return (item.guide ?? '') !== (storedItem.guide ?? '')
      case 'map':
        return !sameLinks(item.links, storedItem.links, 'map')
      case 'notes':
        return JSON.stringify(item.notes) !== JSON.stringify(storedItem.notes)
      case 'links':
        return !sameLinks(item.links, storedItem.links, 'web')
      case 'costs':
        return JSON.stringify(item.costs) !== JSON.stringify(storedItem.costs)
      case 'review':
        return reviewDraft !== (mine?.text ?? '')
    }
    return false
  }, [editing, item, storedItem, timeDraft, reviewDraft, mine?.text, legacyDraft])

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
        setEditing(saved.section ?? 'basic')
        setLegacyDraft(!saved.section)
        setRestored(true)
      } else {
        setReviewDraft(mine?.text ?? '')
      }
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [itemId])

  useEffect(() => {
    if (!hydrated || !editing || !item) return
    if (dirty) saveItemDraft(itemId, { item, timeDraft, reviewDraft, section: editing })
    else void clearItemDraft(itemId)
  }, [hydrated, editing, dirty, item, itemId, timeDraft, reviewDraft])

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

  const patchItem = (patch: Partial<Item>) =>
    setDraftItem((current) => (current ? { ...current, ...patch } : current))

  const beginEdit = (section: ItemDraftSection) => {
    if (editing) return
    const next = copyItem(storedItem)
    // 空白費用按「＋新增」後直接得到第一列，不必再多按一次「新增一筆」。
    if (section === 'costs' && next && next.costs.length === 0) {
      next.costs = [
        { id: newId(), label: '', unitPrice: 0, qty: 1, currency: trip.foreignCurrency },
      ]
    }
    setDraftItem(next)
    setTimeDraft(storedItem.startTime ?? '')
    setReviewDraft(mine?.text ?? '')
    setMapDraft('')
    setWebDraft('')
    setNoteDraft('')
    setFocusLinkId(null)
    setLegacyDraft(false)
    setRestored(false)
    setEditing(section)
  }

  const discardEditing = () => {
    setDraftItem(copyItem(storedItem))
    setTimeDraft(storedItem.startTime ?? '')
    setReviewDraft(mine?.text ?? '')
    setEditing(null)
    setConfirmingCancel(false)
    setRestored(false)
    setLegacyDraft(false)
    void clearItemDraft(itemId)
  }

  const requestCancel = () => {
    if (dirty) setConfirmingCancel(true)
    else discardEditing()
  }

  const completeEditing = () => {
    if (!editing) return

    if (legacyDraft) {
      updateItem(item.id, {
        startTime: normalizeTime(timeDraft),
        title: item.title,
        guide: item.guide,
        category: item.category,
        paymentMethodId: item.paymentMethodId,
        notes: item.notes,
        links: item.links,
        costs: item.costs,
      })
      if (isActual && reviewDraft !== (mine?.text ?? '')) setReview(item.id, reviewDraft)
    } else {
      switch (editing) {
        case 'basic':
          updateItem(item.id, { title: item.title, startTime: normalizeTime(timeDraft) })
          break
        case 'guide':
          updateItem(item.id, { guide: item.guide })
          break
        case 'map':
          updateItem(item.id, {
            links: [
              ...item.links.filter((link) => link.kind === 'map'),
              ...storedItem.links.filter((link) => link.kind === 'web'),
            ],
          })
          break
        case 'notes':
          updateItem(item.id, { notes: item.notes })
          break
        case 'links':
          updateItem(item.id, {
            links: [
              ...storedItem.links.filter((link) => link.kind === 'map'),
              ...item.links.filter((link) => link.kind === 'web'),
            ],
          })
          break
        case 'costs':
          updateItem(item.id, { costs: item.costs })
          break
        case 'review':
          setReview(item.id, reviewDraft)
          break
      }
    }

    setEditing(null)
    setRestored(false)
    setLegacyDraft(false)
    void clearItemDraft(item.id)
  }

  const selectCategory = (category?: ItineraryCategory) => {
    updateItem(storedItem.id, { category })
    if (editing) patchItem({ category })
    setChoosingCategory(false)
  }

  const selectPayment = (paymentMethodId?: string) => {
    updateItem(storedItem.id, { paymentMethodId })
    if (editing) patchItem({ paymentMethodId })
  }

  const toggleNoteOverview = (noteId: string, checked: boolean) => {
    const notes = storedItem.notes.map((note) =>
      note.id === noteId ? { ...note, showInOverview: checked || undefined } : note,
    )
    updateItem(storedItem.id, { notes })
    if (editing === 'notes') {
      patchItem({
        notes: item.notes.map((note) =>
          note.id === noteId ? { ...note, showInOverview: checked || undefined } : note,
        ),
      })
    }
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

  const addLink = (kind: LinkRef['kind']) => {
    const value = kind === 'map' ? mapDraft : webDraft
    if (!value.trim()) return
    if (kind === 'map' && item.links.some((link) => link.kind === 'map')) return
    const link = { ...makeLink(value), kind }
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

  const editButton = (section: ItemDraftSection) =>
    !editing && (
      <button className="detail-edit-btn" onClick={() => beginEdit(section)}>
        編輯
      </button>
    )

  const paymentPicker = item.costs.length > 0 && (
    <div className="detail-payment-row">
      <label className="detail-key" htmlFor="d-method">支付方式</label>
      <select
        id="d-method"
        className="field detail-payment-select"
        value={item.paymentMethodId ?? ''}
        onChange={(event) => selectPayment(event.target.value || undefined)}
      >
        <option value="">未設定</option>
        {methods.map((payment) => (
          <option key={payment.id} value={payment.id}>
            {methodLabel(payment.name, payment.owner)}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <>
      {confirmingCancel && (
        <Modal
          title="尚未儲存變更"
          onCancel={() => setConfirmingCancel(false)}
          onComplete={discardEditing}
          cancelLabel="繼續編輯"
          completeLabel="放棄變更"
          completeDanger
        >
          <p style={{ margin: '12px 0 0' }}>確定要取消並放棄這個區塊的修改嗎？</p>
        </Modal>
      )}
      {renaming && <SettingsModal onClose={() => setRenaming(false)} />}

      <div className="topbar detail-head">
        <strong style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
          {shortDate(item.date)} {item.startTime ?? ''}
        </strong>
        <ConfirmButton
          label="刪除"
          question="刪除這個項目？"
          onConfirm={() => {
            removeItem(item.id)
            void clearItemDraft(item.id)
            onClose()
          }}
        />
      </div>

      <div className="scroll detail-scroll">
        {restored && (
          <div className="detail-restored">
            <span>已還原上次未完成的編輯</span>
            <button className="btn btn-sm" onClick={() => setRestored(false)}>知道了</button>
          </div>
        )}

        <section className="detail-section detail-summary">
          <div className="detail-section-head">
            <span className="detail-kicker">基本資訊</span>
            {editButton('basic')}
          </div>
          {editing === 'basic' ? (
            <div className="detail-form-stack">
              <label className="label" htmlFor="d-title">行程名稱</label>
              <input
                id="d-title"
                className="field"
                style={{ fontSize: 16 }}
                value={item.title}
                onChange={(event) => patchItem({ title: event.target.value })}
                autoFocus
              />
              <label className="label" htmlFor="d-start">時間</label>
              <input
                id="d-start"
                className="field mono"
                style={{ width: 132 }}
                inputMode="numeric"
                placeholder="09:10"
                value={timeDraft}
                onChange={(event) => setTimeDraft(event.target.value)}
                onBlur={() => setTimeDraft(normalizeTime(timeDraft) ?? '')}
              />
            </div>
          ) : (
            <>
              <h2 className="detail-title">{item.title || '未命名行程'}</h2>
              <div className="detail-meta">
                <span>{shortDate(item.date)}</span>
                <span>{item.startTime || '未設定時間'}</span>
              </div>
            </>
          )}

          <div className="detail-category-block">
            <span className="detail-key">行程類型</span>
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
              <button className="detail-value-action" onClick={() => setChoosingCategory(true)}>
                {item.category ? (
                  <>
                    <CategoryIcon category={item.category} size={20} />
                    <span>{item.category}</span>
                    <span className="dim">變更</span>
                  </>
                ) : (
                  <span className="detail-add-text">＋ 設定行程類型</span>
                )}
              </button>
            )}
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-section-head">
            <span className="detail-kicker">遊玩說明</span>
            {(item.guide || editing === 'guide') && editButton('guide')}
          </div>
          {editing === 'guide' ? (
            <textarea
              className="field"
              rows={5}
              value={item.guide ?? ''}
              onChange={(event) => patchItem({ guide: event.target.value })}
              autoFocus
            />
          ) : item.guide?.trim() ? (
            <p className="detail-copy">{item.guide}</p>
          ) : (
            <button className="detail-empty-action" onClick={() => beginEdit('guide')}>
              ＋ 新增遊玩說明
            </button>
          )}
        </section>

        <section className="detail-section">
          <div className="detail-section-head">
            <span className="detail-kicker">Google Map</span>
            {(mapLinks.length > 0 || editing === 'map') && editButton('map')}
          </div>
          {editing === 'map' ? (
            <>
              {mapLinks.map((link) => (
                <div key={link.id} className="link-edit-row">
                  <input
                    className="field"
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
                    className="btn btn-sm"
                    aria-label="刪除 Google Map"
                    onClick={() =>
                      patchItem({ links: item.links.filter((value) => value.id !== link.id) })
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
              {mapLinks.length === 0 && (
                <div className="link-add-row">
                  <input
                    className="field"
                    value={mapDraft}
                    placeholder="貼上 Google Maps 網址"
                    autoFocus
                    onChange={(event) => setMapDraft(event.target.value)}
                    onKeyDown={(event) => isSubmitEnter(event) && addLink('map')}
                  />
                  <button className="btn" onClick={() => addLink('map')}>加入</button>
                </div>
              )}
            </>
          ) : mapLinks.length > 0 ? (
            mapLinks.map((link) => (
              <a
                key={link.id}
                className="detail-link-card"
                href={link.url}
                target="_blank"
                rel="noreferrer"
              >
                <span className="detail-link-icon">⌖</span>
                <span>{link.label || 'Google Map 地點'}</span>
                <span className="dim">開啟</span>
              </a>
            ))
          ) : (
            <button className="detail-empty-action" onClick={() => beginEdit('map')}>
              ＋ 加入地點
            </button>
          )}
        </section>

        <section className="detail-section">
          <div className="detail-section-head">
            <span className="detail-kicker">備註</span>
            {(item.notes.length > 0 || editing === 'notes') && editButton('notes')}
          </div>
          {editing === 'notes' ? (
            <>
              {item.notes.map((note, index) => (
                <div key={note.id} className="detail-note-edit-row">
                  <input
                    type="checkbox"
                    checked={Boolean(note.showInOverview)}
                    onChange={(event) => toggleNoteOverview(note.id, event.target.checked)}
                    aria-label={`在行程總覽顯示備註 ${index + 1}`}
                  />
                  <input
                    className="field"
                    value={note.text}
                    onChange={(event) =>
                      patchItem({
                        notes: item.notes.map((value) =>
                          value.id === note.id ? { ...value, text: event.target.value } : value,
                        ),
                      })
                    }
                  />
                  <button
                    className="btn btn-sm"
                    aria-label="刪除這筆備註"
                    onClick={() =>
                      patchItem({ notes: item.notes.filter((value) => value.id !== note.id) })
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="link-add-row">
                <input
                  className="field"
                  value={noteDraft}
                  placeholder="新增提醒或補充"
                  autoFocus={item.notes.length === 0}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  onKeyDown={(event) => isSubmitEnter(event) && addNote()}
                />
                <button className="btn" onClick={addNote}>加入</button>
              </div>
              <p className="dim detail-help">勾選後會顯示在行程總覽。</p>
            </>
          ) : item.notes.length > 0 ? (
            <div className="detail-note-list">
              {item.notes.map((note, index) => (
                <label key={note.id} className="detail-note-row">
                  <input
                    type="checkbox"
                    checked={Boolean(note.showInOverview)}
                    onChange={(event) => toggleNoteOverview(note.id, event.target.checked)}
                    aria-label={`在行程總覽顯示備註 ${index + 1}`}
                  />
                  <span>{note.text}</span>
                </label>
              ))}
            </div>
          ) : (
            <button className="detail-empty-action" onClick={() => beginEdit('notes')}>
              ＋ 新增備註
            </button>
          )}
        </section>

        <section className="detail-section">
          <div className="detail-section-head">
            <span className="detail-kicker">費用</span>
            {(item.costs.length > 0 || editing === 'costs') && editButton('costs')}
          </div>
          {editing === 'costs' ? (
            <>
              {item.costs.map((cost) => (
                <div key={cost.id} className="costline">
                  <input
                    className="field cl-label"
                    placeholder="項目"
                    value={cost.label}
                    onChange={(event) => patchCost(cost.id, { label: event.target.value })}
                  />
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
                  <select
                    className="field"
                    style={{ width: 74 }}
                    value={cost.currency}
                    onChange={(event) => patchCost(cost.id, { currency: event.target.value })}
                    aria-label="幣別"
                  >
                    <option value={trip.foreignCurrency}>{trip.foreignCurrency}</option>
                    <option value={trip.homeCurrency}>{trip.homeCurrency}</option>
                  </select>
                  <span className="mono dim cl-sub">{formatMoney(lineTotal(cost), cost.currency)}</span>
                  <button
                    className="btn btn-sm"
                    aria-label="刪除這筆費用"
                    onClick={() =>
                      patchItem({ costs: item.costs.filter((value) => value.id !== cost.id) })
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button className="btn btn-sm" onClick={addCost}>＋ 新增一筆</button>
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
              <button className="detail-cost-summary" onClick={() => setCostExpanded((open) => !open)}>
                <span>{item.costs.length} 筆費用明細</span>
                <strong className="mono">{formatTotals(totals) || formatMoney(0, trip.foreignCurrency)}</strong>
                <span className="dim">{costExpanded ? '收合' : '展開'}</span>
              </button>
              {costExpanded && (
                <div className="detail-cost-list">
                  {item.costs.map((cost) => (
                    <div key={cost.id} className="detail-cost-row">
                      <span>{cost.label || '未命名費用'}</span>
                      <span className="dim">{cost.qty !== 1 ? `× ${cost.qty}` : ''}</span>
                      <span className="mono">{formatMoney(lineTotal(cost), cost.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
              {paymentPicker}
            </>
          ) : (
            <button className="detail-empty-action" onClick={() => beginEdit('costs')}>
              ＋ 新增費用
            </button>
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

        <section className="detail-section">
          <div className="detail-section-head">
            <span className="detail-kicker">相關連結</span>
            {(webLinks.length > 0 || editing === 'links') && editButton('links')}
          </div>
          {editing === 'links' ? (
            <>
              {webLinks.map((link) => (
                <div key={link.id} className="link-edit-row">
                  <input
                    className="field"
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
                    className="btn btn-sm"
                    aria-label="刪除這個連結"
                    onClick={() =>
                      patchItem({ links: item.links.filter((value) => value.id !== link.id) })
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="link-add-row">
                <input
                  className="field"
                  value={webDraft}
                  placeholder="貼上訂位、票券或網站網址"
                  autoFocus={webLinks.length === 0}
                  onChange={(event) => setWebDraft(event.target.value)}
                  onKeyDown={(event) => isSubmitEnter(event) && addLink('web')}
                />
                <button className="btn" onClick={() => addLink('web')}>加入</button>
              </div>
            </>
          ) : webLinks.length > 0 ? (
            <div className="detail-link-list">
              {webLinks.map((link) => (
                <a key={link.id} className="detail-link-card" href={link.url} target="_blank" rel="noreferrer">
                  <span className="detail-link-icon">↗</span>
                  <span>{link.label || link.url}</span>
                  <span className="dim">開啟</span>
                </a>
              ))}
            </div>
          ) : (
            <button className="detail-empty-action" onClick={() => beginEdit('links')}>
              ＋ 新增相關連結
            </button>
          )}
        </section>

        {isActual && (
          <section className="detail-section">
            <div className="detail-section-head">
              <span className="detail-kicker">心得</span>
              {(mine?.text || editing === 'review') && editButton('review')}
            </div>
            {others.map((review) => (
              <div key={review.id} className="detail-review">
                <span className="detail-key">{review.author}</span>
                <p>{review.text}</p>
              </div>
            ))}
            {editing === 'review' ? (
              <>
                <button className="detail-author" onClick={() => setRenaming(true)}>{me} · 改名</button>
                <textarea
                  className="field"
                  rows={4}
                  placeholder="實際去了之後的感想"
                  value={reviewDraft}
                  onChange={(event) => setReviewDraft(event.target.value)}
                  autoFocus
                />
              </>
            ) : mine?.text.trim() ? (
              <div className="detail-review">
                <span className="detail-key">{me}</span>
                <p>{mine.text}</p>
              </div>
            ) : (
              <button className="detail-empty-action" onClick={() => beginEdit('review')}>
                ＋ 新增心得
              </button>
            )}
          </section>
        )}
      </div>

      {editing && (
        <div className="editor-actions">
          <button className="btn" onClick={requestCancel}>取消</button>
          <button className="btn btn-primary" onClick={completeEditing}>完成</button>
        </div>
      )}
    </>
  )
}
