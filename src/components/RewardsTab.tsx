import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Trip } from '../types'
import { computeMethod } from '../lib/rewards'
import { formatMoney } from '../lib/money'
import { shortDate } from '../lib/date'
import PaymentEditor from './PaymentEditor'

interface Props {
  trip: Trip
  onSelect: (id: string) => void
}

export default function RewardsTab({ trip, onSelect }: Props) {
  const allPlans = useStore((s) => s.data.plans)
  const allItems = useStore((s) => s.data.items)
  const allPayments = useStore((s) => s.data.payments)
  const allTrips = useStore((s) => s.data.trips)
  const createPayment = useStore((s) => s.createPayment)
  const updatePayment = useStore((s) => s.updatePayment)
  const copyPaymentsFrom = useStore((s) => s.copyPaymentsFrom)
  const [editing, setEditing] = useState<string | null>(null)

  // 回饋只認實際版：規劃版的預估金額不是真的刷出去的錢。
  const actual = useMemo(
    () => allPlans.find((p) => p.tripId === trip.id && p.kind === 'actual' && !p.deleted),
    [allPlans, trip.id],
  )
  const methods = useMemo(
    () => allPayments.filter((p) => p.tripId === trip.id && !p.deleted),
    [allPayments, trip.id],
  )
  const items = useMemo(
    () => (actual ? allItems.filter((i) => i.planId === actual.id && !i.deleted) : []),
    [allItems, actual],
  )
  const results = useMemo(
    () => methods.filter((m) => m.enabled).map((m) => computeMethod(m, items, trip)),
    [methods, items, trip],
  )

  const otherTrips = useMemo(
    () =>
      allTrips.filter(
        (t) => !t.deleted && t.id !== trip.id && allPayments.some((p) => p.tripId === t.id && !p.deleted),
      ),
    [allTrips, allPayments, trip.id],
  )

  const byOwner = useMemo(() => {
    const map = new Map<string, typeof results>()
    for (const r of results) {
      const key = r.method.owner?.trim() || '未指定'
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return [...map.entries()]
  }, [results])

  return (
    <>
      {!actual && (
        <div className="sec" style={{ background: 'var(--accent-bg)' }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>尚未開始跑行程</div>
          <p className="dim" style={{ fontSize: 12, margin: 0 }}>
            回饋只計算實際版的支出。出發時用上方的「建立實際版」開一份，這裡就會開始統計。
            下面的支付方式現在就能先建好。
          </p>
        </div>
      )}

      {byOwner.map(([owner, list]) => (
        <div key={owner}>
          <div className="dayhead" style={{ position: 'static' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{owner}</span>
            <span className="mono dim" style={{ fontSize: 12 }}>
              回饋 {formatMoney(list.reduce((s, r) => s + r.totalReward, 0), list[0].method.currency)}
            </span>
          </div>

          {list.map((res) => (
            <div key={res.method.id} className="sec">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>
                  {res.method.name || '未命名'}
                  <span className="dim" style={{ fontSize: 11, marginLeft: 6 }}>
                    {res.method.kind === 'card' ? '信用卡' : '電子支付'} · {res.txns.length} 筆
                  </span>
                </span>
                <button className="btn btn-sm" onClick={() => setEditing(editing === res.method.id ? null : res.method.id)}>
                  {editing === res.method.id ? '完成' : '設定'}
                </button>
              </div>

              {res.rules.map((rr) => {
                const cap = rr.rule.spendCap
                const pct = cap ? Math.min(100, (Math.min(res.spend, cap) / cap) * 100) : 0
                const exhausted = rr.remainingSpend === 0
                return (
                  <div key={rr.rule.id} style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span>
                        {rr.rule.name} <span className="dim">{(rr.rule.rate * 100).toFixed(1)}%</span>
                      </span>
                      <span className="mono" style={{ color: exhausted ? 'var(--danger)' : 'var(--text-2)' }}>
                        {cap === undefined
                          ? '無消費上限'
                          : exhausted
                            ? '額度已用完'
                            : `還可刷 ${formatMoney(rr.remainingSpend ?? 0, res.method.currency)}`}
                      </span>
                    </div>
                    {cap !== undefined && (
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, marginTop: 4 }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: exhausted ? 'var(--danger)' : 'var(--accent)' }} />
                      </div>
                    )}
                    <div className="mono dim" style={{ fontSize: 11, marginTop: 3 }}>
                      已刷 {formatMoney(res.spend, res.method.currency)}
                      {cap !== undefined && ` / ${formatMoney(cap, res.method.currency)}`}
                      {' · '}累積回饋 {formatMoney(rr.reward, res.method.currency)}
                      {rr.rule.rewardCap !== undefined && ` / ${formatMoney(rr.rule.rewardCap, res.method.currency)}`}
                      {rr.rule.perTxnRewardCap !== undefined && ` · 單筆上限 ${formatMoney(rr.rule.perTxnRewardCap, res.method.currency)}`}
                    </div>
                  </div>
                )
              })}

              {editing === res.method.id && <PaymentEditor method={res.method} trip={trip} />}

              {res.txns.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <span className="label">這趟刷了哪幾筆</span>
                  {res.txns.map(({ item, amount }) => (
                    <button
                      key={item.id}
                      onClick={() => onSelect(item.id)}
                      style={{ display: 'flex', width: '100%', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}
                    >
                      <span className="dim">{shortDate(item.date)} {item.title}</span>
                      <span className="mono">{formatMoney(amount, res.method.currency)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {methods.filter((m) => !m.enabled).length > 0 && (
        <div className="sec">
          <span className="label">這趟沒帶</span>
          {methods.filter((m) => !m.enabled).map((m) => (
            <button key={m.id} className="chip" style={{ marginRight: 4 }} onClick={() => updatePayment(m.id, { enabled: true })}>
              {m.name || '未命名'} ＋帶上
            </button>
          ))}
        </div>
      )}

      <div className="sec" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => setEditing(createPayment(trip.id).id)}>
          ＋ 新增支付方式
        </button>
        {otherTrips.map((t) => (
          <button key={t.id} className="btn btn-sm" onClick={() => copyPaymentsFrom(t.id, trip.id)}>
            從「{t.name}」複製卡片
          </button>
        ))}
      </div>
    </>
  )
}
