import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { EXPENSE_CATEGORIES, PAYMENT_STATUSES, type CostLine, type Trip } from '../types'
import { newId } from '../lib/id'
import { makeLink } from '../lib/maps'
import { formatMoney, lineTotal, sumByCurrency, toHome } from '../lib/money'
import { normalizeTime, shortDate } from '../lib/date'
import { isSubmitEnter } from '../lib/keys'

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
    updateItem(item.id, { links: [...item.links, makeLink(linkDraft)] })
    setLinkDraft('')
  }

  const addNote = () => {
    if (!noteDraft.trim()) return
    updateItem(item.id, { notes: [...item.notes, noteDraft.trim()] })
    setNoteDraft('')
  }

  return (
    <div className="scroll">
      <div className="topbar">
        <button className="btn btn-sm" onClick={onClose} aria-label="關閉">
          ✕
        </button>
        <strong style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
          {shortDate(item.date)} {item.startTime ?? ''}
        </strong>
        <button
          className="btn btn-sm"
          style={{ color: 'var(--danger)' }}
          onClick={() => {
            removeItem(item.id)
            onClose()
          }}
        >
          刪除
        </button>
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
          placeholder="這裡有什麼好吃、好玩、好看的"
          value={item.guide ?? ''}
          onChange={(e) => updateItem(item.id, { guide: e.target.value })}
        />
      </div>

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
            placeholder="實務提醒，例如取車在土庄港"
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
            <a className="chip" href={l.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0 }}>
              <span aria-hidden="true">{l.kind === 'map' ? '◎' : '↗'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.label}
              </span>
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
            placeholder="貼上 Google Maps 或任何網址"
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
            <input
              className="field mono"
              style={{ width: 76 }}
              type="number"
              value={c.unitPrice}
              onChange={(e) => patchCost(c.id, { unitPrice: Number(e.target.value) || 0 })}
              aria-label="單價"
            />
            <span className="dim">×</span>
            <input
              className="field mono"
              style={{ width: 52 }}
              type="number"
              value={c.qty}
              onChange={(e) => patchCost(c.id, { qty: Number(e.target.value) || 0 })}
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
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className="label" htmlFor="d-pay">付款狀態</label>
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
