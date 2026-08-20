import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Plan, Trip } from '../types'
import { computeMethod, type MethodResult } from '../lib/rewards'
import { formatMoney } from '../lib/money'
import { dayCount, shortDate } from '../lib/date'
import { methodLabel, OWNERLESS } from '../lib/owners'
import PaymentEditor from './PaymentEditor'
import PencilIcon from './PencilIcon'
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
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyFrom, setCopyFrom] = useState<string | null>(null)
  const [copyResult, setCopyResult] = useState<string>('')

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
  /*
   * 規劃版與實際版共用同一套卡片，不再各做一套介面。
   * 差別只在 items：規劃版拿到的是空陣列（回饋只認實際版），
   * 所以數字全是初始值、消費明細是空的 —— 明細下面那行字就是在解釋這件事。
   */
  const results = useMemo(
    () => methods.filter((m) => m.enabled).map((m) => computeMethod(m, items, trip)),
    [methods, items, trip],
  )


  const otherTrips = useMemo(
    () =>
      allTrips
        .filter((t) => !t.deleted && t.id !== trip.id)
        .map((t) => ({
          trip: t,
          count: allPayments.filter((p) => p.tripId === t.id && !p.deleted).length,
        }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.trip.startDate.localeCompare(a.trip.startDate)),
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
  // 沒有「全部」這個選項，所以一定有一位被選中。選中的人被刪掉或改名時退回第一位，
  // 否則 ownerFilter 會指向一個不存在的人，整頁變空白。
  const activeOwner = ownerFilter && owners.includes(ownerFilter) ? ownerFilter : owners[0]
  const shown = byOwner.filter(([owner]) => owner === activeOwner)
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
        {otherTrips.length > 0 && (
          <button
            className="btn btn-sm"
            onClick={() => {
              setCopyFrom(otherTrips[0].trip.id)
              setCopyResult('')
              setCopyOpen(true)
            }}
          >
            從其他旅程複製資料
          </button>
        )}
        {copyResult && <span className="dim" style={{ fontSize: 12, alignSelf: 'center' }}>{copyResult}</span>}
      </div>

      {/* 旅程一多，一趟一顆按鈕就會塞爆功能列；收成一顆再進選擇彈窗。 */}
      {copyOpen && (
        <Modal
          title="從其他旅程複製資料"
          onCancel={() => setCopyOpen(false)}
          onComplete={() => {
            const source = otherTrips.find((entry) => entry.trip.id === copyFrom)
            if (!source) return
            const copied = copyPaymentsFrom(source.trip.id, trip.id)
            const skipped = source.count - copied
            setCopyResult(
              copied === 0
                ? `「${source.trip.name}」的 ${source.count} 張都已經有了`
                : `已從「${source.trip.name}」複製 ${copied} 張${skipped ? `，略過 ${skipped} 張既有的` : ''}`,
            )
            setCopyOpen(false)
          }}
          completeLabel="複製"
        >
          <div style={{ paddingTop: 12 }}>
            <p className="dim" style={{ fontSize: 12, margin: '0 0 10px' }}>
              只複製卡片設定，額度與回饋紀錄不會跟著過來。同名同持有人的卡片會自動略過，
              所以重複複製不會產生重複的卡片。
            </p>
            <div style={{ display: 'grid', gap: 6 }}>
              {otherTrips.map(({ trip: t, count }) => (
                <button
                  key={t.id}
                  className="copy-source"
                  data-on={copyFrom === t.id}
                  onClick={() => setCopyFrom(t.id)}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14 }}>{t.name}</span>
                    <span className="dim" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                      {shortDate(t.startDate)} – {shortDate(t.endDate)} · {dayCount(t.startDate, t.endDate)} 天
                    </span>
                  </span>
                  <span className="dim mono" style={{ fontSize: 12 }}>{count} 張</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* 蓋板而非嵌在列表裡：嵌在分組內的話，一改持有人分組就變動，
          整個區塊會被重建，輸入框當場失去焦點，中文根本打不完一個字。 */}
      {editingDraft && (
        <Modal
          title={editingNew ? '新增支付方式' : '編輯支付方式'}
          onCancel={cancelEditor}
          onComplete={completeEditor}
          dirty={editorDirty}
        >
          <PaymentEditor
            method={editingDraft}
            trip={trip}
            isNew={editingNew}
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
          {owners.map((owner) => (
            <button
              key={owner}
              className="daypill"
              data-on={owner === activeOwner}
              onClick={() => setOwnerFilter(owner)}
            >
              {owner}
            </button>
          ))}
        </div>
      )}

      {/* 上面的持有人膠囊已經說明現在看的是誰，不再重複一條持有人橫條。 */}
      <div className="method-cards">
        {shown.flatMap(([, list]) =>
          list.map((res) => (
            <MethodCard
              key={res.method.id}
              res={res}
              planning={!isActual}
              onEdit={() => openEditor(res.method)}
              onSelect={onSelect}
            />
          )),
        )}
      </div>

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
  planning,
  onEdit,
  onSelect,
}: {
  res: MethodResult
  /** 規劃版：卡片長得一樣，但沒有消費紀錄可看，明細入口關掉。 */
  planning: boolean
  onEdit: () => void
  onSelect: (id: string) => void
}) {
  const [detailOpen, setDetailOpen] = useState(false)
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

  const openDetail = () => {
    if (!planning) setDetailOpen(true)
  }

  return (
    <>
      {/*
       * 彈窗要放在可點的卡片外面。Modal 是 portal 到 body 的，但 React 的合成事件
       * 沿的是 React 樹不是 DOM 樹 —— 掛在卡片裡面的話，點背景關掉的那一個點擊
       * 會接著冒泡到卡片的 onClick，當場又把它打開。
       */}
      {detailOpen && (
        <Modal
          title={`${res.method.name || '未命名'} 消費明細`}
          onCancel={() => setDetailOpen(false)}
          variant="picker"
        >
          <div className="txn-table">
            {/* 摘要釘在頂端，明細捲到一半也還看得到總額。 */}
            <div className="txn-row txn-sum">
              <span>已消費 {res.txns.length} 筆</span>
              <span className="mono">{formatMoney(res.spend, cur)}</span>
            </div>
            {res.txns.length === 0 && (
              <p className="dim" style={{ fontSize: 12, margin: '10px 0 0' }}>這張卡還沒有紀錄。</p>
            )}
            {res.txns.map(({ item, amount }) => (
              <button
                key={item.id}
                className="txn-row"
                onClick={() => {
                  setDetailOpen(false)
                  onSelect(item.id)
                }}
              >
                <span className="dim mono">{shortDate(item.date)}</span>
                <span className="dim txn-title">{item.title}</span>
                <span className="mono">{formatMoney(amount, cur)}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      <div
        className="method-card"
        role={planning ? undefined : 'button'}
        tabIndex={planning ? undefined : 0}
        onClick={openDetail}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openDetail()
          }
        }}
      >
      <div className="method-band">
        <span className="method-band-name">
          {res.method.name || '未命名'}
          <span className="method-band-kind">
            {res.method.kind === 'card' ? '信用卡' : '電子支付'}
          </span>
        </span>
        <button
          className="icon-btn method-band-edit"
          onClick={(event) => {
            event.stopPropagation()
            onEdit()
          }}
          aria-label={`編輯 ${methodLabel(res.method.name, res.method.owner)}`}
        >
          <PencilIcon />
        </button>
      </div>
      <div className="method-card-body">

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
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: exhausted ? 'var(--danger)' : 'var(--accent)' }} />
        </div>
      )}
      <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>
        已消費 {res.txns.length} 筆 {formatMoney(res.spend, cur)}
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


      {planning && (
        <p className="dim" style={{ fontSize: 12, margin: '10px 0 0' }}>規劃版不計算回饋</p>
      )}
      </div>
      </div>
    </>
  )
}
