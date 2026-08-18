import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Trip } from '../types'
import { computeMethod, spendCapOf, type MethodResult } from '../lib/rewards'
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
  const [editingId, setEditingId] = useState<string | null>(null)

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

  /** 記在規劃版的支出不會計入回饋，但使用者只會看到 0，得說清楚。 */
  const inPlanning = useMemo(() => {
    const actualId = actual?.id
    const counts: Record<string, number> = {}
    for (const i of allItems) {
      if (i.deleted || !i.paymentMethodId || i.planId === actualId) continue
      counts[i.paymentMethodId] = (counts[i.paymentMethodId] ?? 0) + 1
    }
    return counts
  }, [allItems, actual])

  const otherTrips = useMemo(
    () =>
      allTrips.filter(
        (t) => !t.deleted && t.id !== trip.id && allPayments.some((p) => p.tripId === t.id && !p.deleted),
      ),
    [allTrips, allPayments, trip.id],
  )

  const byOwner = useMemo(() => {
    const map = new Map<string, MethodResult[]>()
    for (const r of results) {
      const key = r.method.owner?.trim() || '未指定持有人'
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return [...map.entries()]
  }, [results])

  const editing = methods.find((m) => m.id === editingId)

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

      {/* 編輯面板放在分組外面。放進分組裡的話，一改持有人分組就變動，
          整個區塊會被重建，輸入框當場失去焦點，中文根本打不完一個字。 */}
      {editing && (
        <div className="sec" style={{ background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label" style={{ margin: 0 }}>編輯支付方式</span>
            <button className="btn btn-sm" onClick={() => setEditingId(null)}>完成</button>
          </div>
          <PaymentEditor method={editing} trip={trip} />
        </div>
      )}

      {byOwner.map(([owner, list]) => (
        <div key={owner}>
          <div className="dayhead" style={{ position: 'static' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{owner}</span>
            <span className="mono dim" style={{ fontSize: 12 }}>
              已累積回饋 {formatMoney(list.reduce((s, r) => s + r.totalReward, 0), list[0].method.currency)}
            </span>
          </div>

          {list.map((res) => (
            <MethodCard
              key={res.method.id}
              res={res}
              planningCount={inPlanning[res.method.id] ?? 0}
              onEdit={() => setEditingId(editingId === res.method.id ? null : res.method.id)}
              onSelect={onSelect}
            />
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
        <button className="btn btn-sm" onClick={() => setEditingId(createPayment(trip.id).id)}>
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

/** 主角是「還能刷多少」，不是「已經拿了多少」—— 站在收銀台前要看的是前者。 */
function MethodCard({
  res,
  planningCount,
  onEdit,
  onSelect,
}: {
  res: MethodResult
  planningCount: number
  onEdit: () => void
  onSelect: (id: string) => void
}) {
  const cur = res.method.currency
  const capped = res.rules.filter((r) => r.remainingSpend !== undefined)
  const remaining = capped.length ? Math.min(...capped.map((r) => r.remainingSpend ?? 0)) : undefined
  const exhausted = remaining === 0
  const totalCap = capped.length ? Math.min(...capped.map((r) => spendCapOf(r.rule) ?? Infinity)) : undefined
  const pct = totalCap && totalCap !== Infinity ? Math.min(100, (res.spend / totalCap) * 100) : 0

  return (
    <div className="sec">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>
          {res.method.name || '未命名'}
          <span className="dim" style={{ fontSize: 11, marginLeft: 6 }}>
            {res.method.kind === 'card' ? '信用卡' : '電子支付'}
          </span>
        </span>
        <button className="btn btn-sm" onClick={onEdit}>設定</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <div className="label" style={{ margin: 0 }}>還可刷</div>
          <div
            className="mono"
            style={{ fontSize: 24, lineHeight: 1.2, color: exhausted ? 'var(--danger)' : 'var(--text)' }}
          >
            {remaining === undefined ? '無上限' : formatMoney(remaining, cur)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="label" style={{ margin: 0 }}>已累積回饋</div>
          <div className="mono" style={{ fontSize: 16 }}>{formatMoney(res.totalReward, cur)}</div>
        </div>
      </div>

      {totalCap !== undefined && totalCap !== Infinity && (
        <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, marginTop: 8 }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: exhausted ? 'var(--danger)' : 'var(--accent)' }} />
        </div>
      )}
      <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>
        已刷 {formatMoney(res.spend, cur)}
        {totalCap !== undefined && totalCap !== Infinity && ` / ${formatMoney(totalCap, cur)}`}
        {' · '}{res.txns.length} 筆
      </div>

      {res.rules.map((rr) => (
        <div key={rr.rule.id} className="dim" style={{ fontSize: 11, marginTop: 4 }}>
          {rr.rule.name} {(rr.rule.rate * 100).toFixed(1)}%
          {rr.rule.rewardCap !== undefined && ` · 回饋上限 ${formatMoney(rr.rule.rewardCap, cur)}`}
          {rr.rule.perTxnRewardCap !== undefined && ` · 單筆上限 ${formatMoney(rr.rule.perTxnRewardCap, cur)}`}
          {rr.remainingSpend !== undefined && ` · 還可刷 ${formatMoney(rr.remainingSpend, cur)}`}
          {' · '}已拿 {formatMoney(rr.reward, cur)}
        </div>
      ))}

      {planningCount > 0 && (
        <div className="dim" style={{ fontSize: 11, marginTop: 8 }}>
          規劃版另有 {planningCount} 筆用這張卡，回饋只計算實際版。
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <span className="label">刷卡明細</span>
        {res.txns.length === 0 && <div className="dim" style={{ fontSize: 12 }}>這張卡還沒有紀錄。</div>}
        {res.txns.map(({ item, amount }) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '4px 0', borderBottom: '0.5px solid var(--border)' }}
          >
            <span className="dim" style={{ textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {shortDate(item.date)} {item.title}
            </span>
            <span className="mono" style={{ flex: 'none' }}>{formatMoney(amount, cur)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
