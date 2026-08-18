import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { EXPENSE_CATEGORIES, PAYMENT_STATUSES, type CostLine, type Trip } from '../types'
import { newId } from '../lib/id'
import { makeLink } from '../lib/maps'
import { formatMoney, lineTotal, sumByCurrency, toHome } from '../lib/money'
import { normalizeTime, shortDate } from '../lib/date'
import { isSubmitEnter } from '../lib/keys'
import ConfirmButton from './ConfirmButton'
import NumberField from './NumberField'
import { methodLabel } from '../lib/owners'
import SettingsModal from './SettingsModal'
import { amountInMethodCurrency, computeMethod, suggestSplit } from '../lib/rewards'

interface Props {
  trip: Trip
  itemId: string
  onClose: () => void
}

export default function ItemDetail({ trip, itemId, onClose }: Props) {
  const item = useStore((s) => s.data.items.find((i) => i.id === itemId))
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const [linkDraft, setLinkDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [timeDraft, setTimeDraft] = useState(item?.startTime ?? '')
  const [renaming, setRenaming] = useState(false)
  const [focusLinkId, setFocusLinkId] = useState<string | null>(null)
  const allPayments = useStore((s) => s.data.payments)
  const allItems = useStore((s) => s.data.items)
  const allReviews = useStore((s) => s.data.reviews)
  const setReview = useStore((s) => s.setReview)
  const me = useStore((s) => s.settings.memberName)

  // 一人一則：自己那則可以編輯，同行者的只讀，兩邊不會互相覆蓋。
  const reviews = useMemo(
    () => allReviews.filter((r) => r.itemId === itemId && !r.deleted),
    [allReviews, itemId],
  )
  const mine = reviews.find((r) => r.author === me)
  const others = reviews.filter((r) => r.author !== me && r.text.trim())
  // 心得是跑完行程才寫的東西，規劃版放這欄只是雜訊。
  const isActual = useStore((s) =>
    s.data.plans.some((p) => p.id === item?.planId && p.kind === 'actual' && !p.deleted),
  )

  const methods = useMemo(
    () => allPayments.filter((p) => p.tripId === trip.id && !p.deleted && p.enabled),
    [allPayments, trip.id],
  )
  const method = methods.find((m) => m.id === item?.paymentMethodId)

  /** 拆單建議要扣掉這張卡已經刷過的金額，否則額度快滿時會給出灌水的建議。 */
  const splitHint = useMemo(() => {
    if (!item || !method) return null
    const others = allItems.filter((i) => i.id !== item.id && i.planId === item.planId)
    const spent = computeMethod(method, others, trip).txns.map((t) => t.amount)
    return suggestSplit(method, amountInMethodCurrency(item, method, trip), spent)
  }, [item, method, allItems, trip])

  useEffect(() => {
    setTimeDraft(item?.startTime ?? '')
  }, [itemId, item?.startTime])

  if (!item || item.deleted) return <div className="empty">項目已刪除。</div>

  const totals = sumByCurrency(item.costs)
  const home = toHome(totals, trip)
  const showConverted = !totals[trip.homeCurrency] || Object.keys(totals).length > 1

  const patchCost = (id: string, patch: Partial<CostLine>) =>
    updateItem(item.id, { costs: item.costs.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  const addCost = () =>
    updateItem(item.id, {
      costs: [
        ...item.costs,
        { id: newId(), label: '', unitPrice: 0, qty: 1, currency: trip.foreignCurrency },
      ],
    })

  const addLink = () => {
    if (!linkDraft.trim()) return
    const link = makeLink(linkDraft)
    updateItem(item.id, { links: [...item.links, link] })
    setLinkDraft('')
    // 短網址拆不出地名，游標直接跳過去讓你接著打，省一次點擊。
    if (!link.label) setFocusLinkId(link.id)
  }

  const addNote = () => {
    if (!noteDraft.trim()) return
    updateItem(item.id, { notes: [...item.notes, noteDraft.trim()] })
    setNoteDraft('')
  }

  return (
    <div className="scroll">
      {renaming && <SettingsModal onClose={() => setRenaming(false)} />}
      <div className="topbar">
        <button className="btn btn-sm" onClick={onClose} aria-label="關閉">
          ✕
        </button>
        <strong style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
          {shortDate(item.date)} {item.startTime ?? ''}
        </strong>
        <ConfirmButton
          label="刪除"
          question="刪除這個項目？"
          onConfirm={() => {
            removeItem(item.id)
            onClose()
          }}
        />
      </div>

      <div className="sec">
        <input
          className="field"
          style={{ fontSize: 16 }}
          value={item.title}
          onChange={(e) => updateItem(item.id, { title: e.target.value })}
          aria-label="標題"
        />
        <div style={{ marginTop: 8, width: 132 }}>
          <label className="label" htmlFor="d-start">時間</label>
          {/* 用文字欄而非 type="time"，一來永遠 24 小時制不出現上午下午，
              二來航班、船班那種 09:10、18:50 才填得進去。 */}
          <input
            id="d-start"
            className="field mono"
            inputMode="numeric"
            placeholder="09:10"
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            onBlur={() => {
              const t = normalizeTime(timeDraft)
              updateItem(item.id, { startTime: t })
              setTimeDraft(t ?? '')
            }}
          />
        </div>
      </div>

      <div className="sec">
        <label className="label" htmlFor="d-guide">遊玩說明</label>
        <textarea
          id="d-guide"
          className="field"
          rows={3}
          value={item.guide ?? ''}
          onChange={(e) => updateItem(item.id, { guide: e.target.value })}
        />
      </div>

      {isActual && (
        <div className="sec">
          <span className="label">心得</span>
          {others.map((r) => (
            <div key={r.id} style={{ marginBottom: 8 }}>
              <div className="dim" style={{ fontSize: 11 }}>{r.author}</div>
              <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{r.text}</div>
            </div>
          ))}
          <button
            className="dim"
            style={{ fontSize: 11, marginBottom: 3, textDecoration: 'underline' }}
            onClick={() => setRenaming(true)}
          >
            {me} · 改名
          </button>
          <textarea
            id="d-review"
            className="field"
            rows={3}
            placeholder="實際去了之後的感想"
            value={mine?.text ?? ''}
            onChange={(e) => setReview(item.id, e.target.value)}
          />
        </div>
      )}

      <div className="sec">
        <span className="label">備註</span>
        {item.notes.map((n, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              className="field"
              value={n}
              onChange={(e) =>
                updateItem(item.id, {
                  notes: item.notes.map((v, i) => (i === idx ? e.target.value : v)),
                })
              }
              aria-label={`備註 ${idx + 1}`}
            />
            <button
              className="btn btn-sm"
              onClick={() => updateItem(item.id, { notes: item.notes.filter((_, i) => i !== idx) })}
              aria-label="刪除這筆備註"
            >
              ✕
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="field"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => isSubmitEnter(e) && addNote()}
          />
          <button className="btn" onClick={addNote}>加入</button>
        </div>
      </div>

      <div className="sec">
        <span className="label">連結</span>
        {item.links.map((l) => (
          <div key={l.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <span className="dim" aria-hidden="true" style={{ flex: 'none' }}>
              {l.kind === 'map' ? '◎' : '↗'}
            </span>
            <input
              className="field"
              style={{ flex: 1, minWidth: 0 }}
              value={l.label}
              onChange={(e) =>
                updateItem(item.id, {
                  links: item.links.map((v) => (v.id === l.id ? { ...v, label: e.target.value } : v)),
                })
              }
              aria-label="連結名稱"
              autoFocus={l.id === focusLinkId}
              placeholder={l.url}
            />
            <a className="btn btn-sm" href={l.url} target="_blank" rel="noreferrer">
              開啟
            </a>
            <button
              className="btn btn-sm"
              onClick={() => updateItem(item.id, { links: item.links.filter((v) => v.id !== l.id) })}
              aria-label="刪除這個連結"
            >
              ✕
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="field"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => isSubmitEnter(e) && addLink()}
          />
          <button className="btn" onClick={addLink}>加入</button>
        </div>
      </div>

      <div className="sec">
        <span className="label">費用明細</span>
        {item.costs.map((c) => (
          <div key={c.id} className="costline">
            <input
              className="field cl-label"
              placeholder="項目"
              value={c.label}
              onChange={(e) => patchCost(c.id, { label: e.target.value })}
              aria-label="費用項目"
            />
            <NumberField
              className="field mono"
              style={{ width: 76 }}
              value={c.unitPrice}
              emptyAs={0}
              onChange={(v) => patchCost(c.id, { unitPrice: v ?? 0 })}
              aria-label="單價"
            />
            <span className="dim">×</span>
            <NumberField
              className="field mono"
              style={{ width: 52 }}
              value={c.qty}
              emptyAs={0}
              onChange={(v) => patchCost(c.id, { qty: v ?? 0 })}
              aria-label="數量"
            />
            <select
              className="field"
              style={{ width: 74 }}
              value={c.currency}
              onChange={(e) => patchCost(c.id, { currency: e.target.value })}
              aria-label="幣別"
            >
              <option value={trip.foreignCurrency}>{trip.foreignCurrency}</option>
              <option value={trip.homeCurrency}>{trip.homeCurrency}</option>
            </select>
            <span className="mono dim cl-sub">{formatMoney(lineTotal(c), c.currency)}</span>
            <button
              className="btn btn-sm"
              onClick={() => updateItem(item.id, { costs: item.costs.filter((v) => v.id !== c.id) })}
              aria-label="刪除這筆費用"
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={addCost}>＋ 新增一筆</button>
        {item.costs.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            <strong style={{ fontSize: 14, fontWeight: 500 }}>合計</strong>
            <span className="mono" style={{ fontSize: 14 }}>
              {Object.entries(totals)
                .map(([cur, amt]) => formatMoney(amt, cur))
                .join(' · ')}
              {showConverted && (
                <span className="dim"> ≈ {formatMoney(home, trip.homeCurrency)}</span>
              )}
            </span>
          </div>
        )}
      </div>

      {splitHint && (
        <div className="sec" style={{ background: 'var(--ok-bg)' }}>
          <div style={{ fontSize: 13, color: 'var(--ok)' }}>
            分成 {splitHint.splits} 筆各 {formatMoney(splitHint.each, splitHint.currency)}
            {/* 卡片上限是台幣、但你在當地是刷外幣，只給台幣數字在收銀台前用不上 */}
            {splitHint.currency === trip.homeCurrency && totals[trip.foreignCurrency] !== undefined && (
              <span>（約 {formatMoney(splitHint.each / trip.rate, trip.foreignCurrency)}）</span>
            )}
            ，可多拿 {formatMoney(splitHint.gain, splitHint.currency)} 回饋
          </div>
          <p className="dim" style={{ fontSize: 11, margin: '3px 0 0' }}>
            這張卡有單筆回饋上限，一次刷完會有一部分拿不到。
          </p>
        </div>
      )}

      <div className="sec" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className="label" htmlFor="d-cat">費用類型</label>
          <select
            id="d-cat"
            className="field"
            value={item.category ?? ''}
            onChange={(e) =>
              updateItem(item.id, { category: (e.target.value || undefined) as typeof item.category })
            }
          >
            <option value="">未分類</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label className="label" htmlFor="d-method">支付方式</label>
          <select
            id="d-method"
            className="field"
            value={item.paymentMethodId ?? ''}
            onChange={(e) => updateItem(item.id, { paymentMethodId: e.target.value || undefined })}
          >
            <option value="">—</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>{methodLabel(m.name, m.owner)}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          {/* 純提醒欄位，不影響回饋計算 —— 用途是行前訂房時記得哪家還沒付。 */}
          <label className="label" htmlFor="d-pay">付款狀態（提醒）</label>
          <select
            id="d-pay"
            className="field"
            value={item.paymentStatus ?? ''}
            onChange={(e) =>
              updateItem(item.id, {
                paymentStatus: (e.target.value || undefined) as typeof item.paymentStatus,
              })
            }
          >
            <option value="">—</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {item.paymentStatus === '自動結帳' && (
          <div style={{ flex: 1, minWidth: 120 }}>
            <label className="label" htmlFor="d-charge">扣款日</label>
            <input
              id="d-charge"
              type="date"
              className="field"
              value={item.chargeDate ?? ''}
              onChange={(e) => updateItem(item.id, { chargeDate: e.target.value || undefined })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
