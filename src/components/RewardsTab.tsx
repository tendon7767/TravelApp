import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Trip } from '../types'
import { computeMethod, spendCapOf, type MethodResult } from '../lib/rewards'
import { formatMoney } from '../lib/money'
import { shortDate } from '../lib/date'
import { methodLabel, OWNERLESS, ownerColor } from '../lib/owners'
import PaymentEditor from './PaymentEditor'
import Modal from './Modal'

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
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null)

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
    const map = new Map<string, MethodResult[]>()
    for (const r of results) {
      const key = r.method.owner?.trim() || OWNERLESS
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return [...map.entries()]
  }, [results])

  const owners = useMemo(() => byOwner.map(([owner]) => owner), [byOwner])
  const shown = ownerFilter ? byOwner.filter(([owner]) => owner === ownerFilter) : byOwner
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

      {/* 蓋板而非嵌在列表裡：嵌在分組內的話，一改持有人分組就變動，
          整個區塊會被重建，輸入框當場失去焦點，中文根本打不完一個字。 */}
      {editing && (
        <Modal title="編輯支付方式" onClose={() => setEditingId(null)}>
          <PaymentEditor method={editing} trip={trip} />
        </Modal>
      )}

      {owners.length > 1 && (
        <div className="daystrip" style={{ position: 'static' }}>
          <button
            className="daypill"
            data-on={ownerFilter === null}
            onClick={() => setOwnerFilter(null)}
          >
            全部
          </button>
          {owners.map((owner) => (
            <button
              key={owner}
              className="daypill"
              data-on={ownerFilter === owner}
              style={ownerFilter === owner ? { background: ownerColor(owner), color: '#fff' } : undefined}
              onClick={() => setOwnerFilter(owner)}
            >
              {owner}
            </button>
          ))}
        </div>
      )}

      {shown.map(([owner, list]) => (
        <div key={owner}>
          <div
            className="dayhead"
            style={{ position: 'static', borderLeft: `3px solid ${ownerColor(owner)}` }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: ownerColor(owner) }}>{owner}</span>
            <span className="mono dim" style={{ fontSize: 12 }}>
              已累積回饋 {formatMoney(list.reduce((s, r) => s + r.totalReward, 0), list[0].method.currency)}
            </span>
          </div>

          {list.map((res) => (
            <MethodCard
              key={res.method.id}
              res={res}
              accent={ownerColor(owner)}
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
              {methodLabel(m.name, m.owner)} ＋帶上
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

/** 數字要跳出來，標籤退到後面：一整行同樣灰的文字裡沒有東西抓得住視線。 */
function Stat({
  label,
  value,
  tone,
  muted,
}: {
  label: string
  value: string
  tone?: 'accent' | 'danger'
  muted?: boolean
}) {
  const color =
    tone === 'danger' ? 'var(--danger)' : tone === 'accent' ? 'var(--accent)' : 'var(--text)'
  return (
    <div className="stat">
      <div className="statlabel">{label}</div>
      <div className="mono statvalue" style={{ color, opacity: muted ? 0.65 : 1 }}>
        {value}
      </div>
    </div>
  )
}

/** 主角是「還能刷多少」，不是「已經拿了多少」—— 站在收銀台前要看的是前者。 */
function MethodCard({
  res,
  accent,
  onEdit,
  onSelect,
}: {
  res: MethodResult
  accent: string
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
    <div className="sec" style={{ borderLeft: `3px solid ${accent}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>
          {res.method.name || '未命名'}
          <span className="dim" style={{ fontSize: 11, marginLeft: 6 }}>
            {res.method.kind === 'card' ? '信用卡' : '電子支付'}
            {res.method.owner?.trim() ? ` · ${res.method.owner.trim()}` : ''}
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
        <div key={rr.rule.id} className="rulebox">
          <div className="rulehead">
            {rr.rule.name}
            <span className="mono rulerate">{(rr.rule.rate * 100).toFixed(1)}%</span>
          </div>
          <div className="rulestats">
            {rr.remainingSpend !== undefined && (
              <Stat
                label="還可刷"
                value={formatMoney(rr.remainingSpend, cur)}
                tone={rr.remainingSpend === 0 ? 'danger' : 'accent'}
              />
            )}
            <Stat label="已拿回饋" value={formatMoney(rr.reward, cur)} />
            {rr.rule.rewardCap !== undefined && (
              <Stat label="回饋上限" value={formatMoney(rr.rule.rewardCap, cur)} muted />
            )}
            {rr.rule.perTxnRewardCap !== undefined && (
              <Stat label="單筆上限" value={formatMoney(rr.rule.perTxnRewardCap, cur)} muted />
            )}
          </div>
        </div>
      ))}


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
