import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Plan, Trip } from '../types'
import { computeMethod, type MethodResult } from '../lib/rewards'
import { formatMoney } from '../lib/money'
import { shortDate } from '../lib/date'
import { methodLabel, OWNERLESS, ownerColor } from '../lib/owners'
import PaymentEditor from './PaymentEditor'
import Modal from './Modal'

interface Props {
  trip: Trip
  plan?: Plan
  onSelect: (id: string) => void
}

export default function RewardsTab({ trip, plan, onSelect }: Props) {
  const allItems = useStore((s) => s.data.items)
  const allPayments = useStore((s) => s.data.payments)
  const allTrips = useStore((s) => s.data.trips)
  const createPayment = useStore((s) => s.createPayment)
  const updatePayment = useStore((s) => s.updatePayment)
  const removePayment = useStore((s) => s.removePayment)
  const copyPaymentsFrom = useStore((s) => s.copyPaymentsFrom)
  const [editingDraft, setEditingDraft] = useState<MethodResult['method'] | null>(null)
  const [editingNew, setEditingNew] = useState(false)
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null)

  const isActual = plan?.kind === 'actual'
  const methods = useMemo(
    () => allPayments.filter((p) => p.tripId === trip.id && !p.deleted),
    [allPayments, trip.id],
  )
  const editorDirty = useMemo(() => {
    if (!editingDraft) return false
    const stored = methods.find((method) => method.id === editingDraft.id)
    return Boolean(stored && JSON.stringify(stored) !== JSON.stringify(editingDraft))
  }, [editingDraft, methods])
  const items = useMemo(
    () => (isActual && plan ? allItems.filter((i) => i.planId === plan.id && !i.deleted) : []),
    [allItems, isActual, plan],
  )
  const results = useMemo(
    () =>
      isActual
        ? methods.filter((m) => m.enabled).map((m) => computeMethod(m, items, trip))
        : [],
    [methods, items, trip, isActual],
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
  const openEditor = (method: MethodResult['method'], isNew = false) => {
    setEditingDraft({ ...method, rules: method.rules.map((r) => ({ ...r })) })
    setEditingNew(isNew)
  }

  const closeEditor = () => {
    setEditingDraft(null)
    setEditingNew(false)
  }

  const cancelEditor = () => {
    if (editingNew && editingDraft) removePayment(editingDraft.id)
    closeEditor()
  }

  const completeEditor = () => {
    if (editingDraft) updatePayment(editingDraft.id, editingDraft)
    closeEditor()
  }

  return (
    <>
      <div className="sec" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm"
          onClick={() => openEditor(createPayment(trip.id), true)}
        >
          ＋ 新增支付方式
        </button>
        {otherTrips.map((t) => (
          <button key={t.id} className="btn btn-sm" onClick={() => copyPaymentsFrom(t.id, trip.id)}>
            從「{t.name}」複製卡片
          </button>
        ))}
      </div>

      {!isActual && (
        <div className="sec" style={{ background: 'var(--accent-bg)' }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>規劃版不計算回饋</div>
          <p className="dim" style={{ fontSize: 12, margin: 0 }}>
            規劃中的費用只是預估，不會算進已刷金額與回饋。出發後請用上方的「建立實際版」，
            或切換到既有的實際版查看計算結果。
          </p>
        </div>
      )}

      {!isActual && methods.length > 0 && (
        <div className="sec">
          <span className="label">支付方式設定</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {methods.map((m) => (
              <button key={m.id} className="chip" onClick={() => openEditor(m)}>
                {methodLabel(m.name, m.owner)}{m.enabled ? '' : ' · 這趟沒帶'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 蓋板而非嵌在列表裡：嵌在分組內的話，一改持有人分組就變動，
          整個區塊會被重建，輸入框當場失去焦點，中文根本打不完一個字。 */}
      {editingDraft && (
        <Modal
          title="編輯支付方式"
          onCancel={cancelEditor}
          onComplete={completeEditor}
          dirty={editorDirty}
        >
          <PaymentEditor
            method={editingDraft}
            trip={trip}
            onChange={(patch) =>
              setEditingDraft((current) => (current ? { ...current, ...patch } : current))
            }
            onRemove={() => {
              removePayment(editingDraft.id)
              closeEditor()
            }}
          />
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
              onEdit={() => openEditor(res.method)}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}

      {isActual && methods.filter((m) => !m.enabled).length > 0 && (
        <div className="sec">
          <span className="label">這趟沒帶</span>
          {methods.filter((m) => !m.enabled).map((m) => (
            <button key={m.id} className="chip" style={{ marginRight: 4 }} onClick={() => updatePayment(m.id, { enabled: true })}>
              {methodLabel(m.name, m.owner)} ＋帶上
            </button>
          ))}
        </div>
      )}

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
  // 最緊的那條規則決定你實際還能刷多少
  const binding = capped.length
    ? capped.reduce((a, b) => ((a.remainingSpend ?? 0) <= (b.remainingSpend ?? 0) ? a : b))
    : undefined
  const remaining = binding?.remainingSpend
  const exhausted = remaining === 0
  // 進度看的是「回饋領了多少」，不是「刷了多少」——
  // 有單筆上限時兩者不成比例，用刷的金額會高估進度。
  const rewardCap = binding?.rule.rewardCap
  const pct = rewardCap ? Math.min(100, (binding!.reward / rewardCap) * 100) : 0

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

      {rewardCap !== undefined && (
        <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, marginTop: 8 }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: exhausted ? 'var(--danger)' : accent }} />
        </div>
      )}
      <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>
        已刷 {formatMoney(res.spend, cur)} · {res.txns.length} 筆
        {rewardCap !== undefined &&
          ` · 回饋 ${formatMoney(binding!.reward, cur)} / ${formatMoney(rewardCap, cur)}`}
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
