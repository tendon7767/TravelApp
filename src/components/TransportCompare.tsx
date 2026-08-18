import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { CostLine, Trip } from '../types'
import { newId } from '../lib/id'
import { formatMoney, lineTotal, sumByCurrency, toHome } from '../lib/money'
import ConfirmButton from './ConfirmButton'

/** 租車 vs 電車巴士這類方案比價，與行程分開，純粹是出發前的試算。 */
export default function TransportCompare({ trip }: { trip: Trip }) {
  const allOptions = useStore((s) => s.data.transports)
  const createTransport = useStore((s) => s.createTransport)
  const updateTransport = useStore((s) => s.updateTransport)
  const removeTransport = useStore((s) => s.removeTransport)
  const [open, setOpen] = useState(false)

  const options = useMemo(
    () => allOptions.filter((t) => t.tripId === trip.id && !t.deleted),
    [allOptions, trip.id],
  )

  const totals = options.map((o) => toHome(sumByCurrency(o.lines), trip))
  const cheapest = totals.length ? Math.min(...totals.filter((t) => t > 0)) : 0

  const patchLine = (optionId: string, lines: CostLine[], lineId: string, patch: Partial<CostLine>) =>
    updateTransport(optionId, { lines: lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) })

  return (
    <div className="sec">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label" style={{ margin: 0 }}>交通方案比價</span>
        <button className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? '收合' : `展開${options.length ? `（${options.length} 案）` : ''}`}
        </button>
      </div>

      {open && (
        <>
          {options.map((o, idx) => {
            const home = totals[idx]
            const isBest = home > 0 && home === cheapest && options.length > 1
            return (
              <div
                key={o.id}
                className="card"
                style={{ padding: 10, marginTop: 10, borderColor: isBest ? 'var(--ok)' : undefined }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    className="field"
                    style={{ flex: 1, minWidth: 0 }}
                    value={o.name}
                    placeholder="方案名稱，例如 租車"
                    onChange={(e) => updateTransport(o.id, { name: e.target.value })}
                    aria-label="方案名稱"
                  />
                  {isBest && <span className="chip" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>最便宜</span>}
                  <ConfirmButton label="刪除" question="刪除這個方案？" onConfirm={() => removeTransport(o.id)} />
                </div>

                {o.lines.map((l) => (
                  <div key={l.id} className="costline">
                    <input
                      className="field cl-label"
                      placeholder="項目"
                      value={l.label}
                      onChange={(e) => patchLine(o.id, o.lines, l.id, { label: e.target.value })}
                      aria-label="項目"
                    />
                    <input
                      className="field mono"
                      style={{ width: 82 }}
                      type="number"
                      value={l.unitPrice}
                      onChange={(e) => patchLine(o.id, o.lines, l.id, { unitPrice: Number(e.target.value) || 0 })}
                      aria-label="單價"
                    />
                    <span className="dim">×</span>
                    <input
                      className="field mono"
                      style={{ width: 52 }}
                      type="number"
                      value={l.qty}
                      onChange={(e) => patchLine(o.id, o.lines, l.id, { qty: Number(e.target.value) || 0 })}
                      aria-label="數量"
                    />
                    <select
                      className="field"
                      style={{ width: 74 }}
                      value={l.currency}
                      onChange={(e) => patchLine(o.id, o.lines, l.id, { currency: e.target.value })}
                      aria-label="幣別"
                    >
                      <option value={trip.foreignCurrency}>{trip.foreignCurrency}</option>
                      <option value={trip.homeCurrency}>{trip.homeCurrency}</option>
                    </select>
                    <span className="mono dim cl-sub">{formatMoney(lineTotal(l), l.currency)}</span>
                    <button
                      className="btn btn-sm"
                      onClick={() => updateTransport(o.id, { lines: o.lines.filter((v) => v.id !== l.id) })}
                      aria-label="刪除這一項"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      updateTransport(o.id, {
                        lines: [...o.lines, { id: newId(), label: '', unitPrice: 0, qty: 1, currency: trip.foreignCurrency }],
                      })
                    }
                  >
                    ＋ 新增一項
                  </button>
                  <span className="mono" style={{ fontSize: 15 }}>{formatMoney(home, trip.homeCurrency)}</span>
                </div>
              </div>
            )
          })}

          <button
            className="btn btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => createTransport(trip.id, `方案 ${String.fromCharCode(65 + options.length)}`)}
          >
            ＋ 新增方案
          </button>

          {options.length > 1 && cheapest > 0 && (
            <p className="dim" style={{ fontSize: 12, margin: '8px 0 0' }}>
              最貴與最便宜相差 {formatMoney(Math.max(...totals) - cheapest, trip.homeCurrency)}。
            </p>
          )}
        </>
      )}
    </div>
  )
}
