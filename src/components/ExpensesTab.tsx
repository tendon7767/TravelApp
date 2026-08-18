import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Item, type Plan, type Trip } from '../types'
import { eachDay, shortDate, todayISO } from '../lib/date'
import { newId } from '../lib/id'
import {
  formatMoney,
  formatTotals,
  isUncategorized,
  itemTotals,
  mergeTotals,
  toHome,
} from '../lib/money'
import TransportCompare from './TransportCompare'

interface Props {
  trip: Trip
  plan: Plan
  onSelect: (id: string) => void
}

export default function ExpensesTab({ trip, plan, onSelect }: Props) {
  const allItems = useStore((s) => s.data.items)
  const allPayments = useStore((s) => s.data.payments)
  const createItem = useStore((s) => s.createItem)

  const items = useMemo(
    () => allItems.filter((i) => i.planId === plan.id && !i.deleted),
    [allItems, plan.id],
  )
  const methods = useMemo(
    () => allPayments.filter((p) => p.tripId === trip.id && !p.deleted && p.enabled),
    [allPayments, trip.id],
  )

  const [quick, setQuick] = useState<{ open: boolean; amount: string; cat: ExpenseCategory; cur: string; methodId: string }>(
    { open: false, amount: '', cat: '餐飲', cur: trip.foreignCurrency, methodId: '' },
  )

  const grand = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const i of items) mergeTotals(acc, itemTotals(i))
    return acc
  }, [items])

  const byCategory = useMemo(() => {
    const acc = new Map<string, Record<string, number>>()
    for (const i of items) {
      const totals = itemTotals(i)
      if (!Object.keys(totals).length) continue
      const key = i.category ?? '未分類'
      acc.set(key, mergeTotals(acc.get(key) ?? {}, totals))
    }
    return acc
  }, [items])

  const byDay = useMemo(() => {
    const days = eachDay(trip.startDate, trip.endDate)
    return days.map((day) => {
      const acc: Record<string, number> = {}
      for (const i of items) if (i.date === day) mergeTotals(acc, itemTotals(i))
      return { day, totals: acc, home: toHome(acc, trip) }
    })
  }, [items, trip])

  const missing = useMemo(() => items.filter(isUncategorized), [items])
  const grandHome = toHome(grand, trip)
  const dayMax = Math.max(1, ...byDay.map((d) => d.home))

  const submitQuick = () => {
    const value = Number(quick.amount)
    if (!value) return
    const today = todayISO()
    const date = today >= trip.startDate && today <= trip.endDate ? today : trip.startDate
    const item = createItem({
      planId: plan.id,
      date,
      title: quick.cat,
      category: quick.cat,
      paymentMethodId: quick.methodId || undefined,
      paymentStatus: quick.methodId ? '已刷卡' : undefined,
      costs: [{ id: newId(), label: '', unitPrice: value, qty: 1, currency: quick.cur }],
    })
    setQuick({ ...quick, open: false, amount: '' })
    onSelect(item.id)
  }

  return (
    <>
      <div className="sec">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="label" style={{ margin: 0 }}>這趟總計</span>
          <button className="btn btn-sm" onClick={() => setQuick({ ...quick, open: !quick.open })}>
            {quick.open ? '取消' : '＋ 快速記帳'}
          </button>
        </div>
        <div className="mono" style={{ fontSize: 22, marginTop: 4 }}>
          {formatMoney(grandHome, trip.homeCurrency)}
        </div>
        <div className="mono dim" style={{ fontSize: 13 }}>{formatTotals(grand) || '尚無支出'}</div>
      </div>

      {quick.open && (
        <div className="sec" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            className="field mono"
            style={{ width: 108 }}
            type="number"
            inputMode="decimal"
            autoFocus
            placeholder="金額"
            value={quick.amount}
            onChange={(e) => setQuick({ ...quick, amount: e.target.value })}
          />
          <select className="field" style={{ width: 82 }} value={quick.cur} onChange={(e) => setQuick({ ...quick, cur: e.target.value })} aria-label="幣別">
            <option value={trip.foreignCurrency}>{trip.foreignCurrency}</option>
            <option value={trip.homeCurrency}>{trip.homeCurrency}</option>
          </select>
          <select className="field" style={{ width: 92 }} value={quick.cat} onChange={(e) => setQuick({ ...quick, cat: e.target.value as ExpenseCategory })} aria-label="類型">
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="field" style={{ flex: 1, minWidth: 120 }} value={quick.methodId} onChange={(e) => setQuick({ ...quick, methodId: e.target.value })} aria-label="支付方式">
            <option value="">未指定支付方式</option>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.name || '未命名'}</option>)}
          </select>
          <button className="btn btn-primary" onClick={submitQuick}>記一筆</button>
        </div>
      )}

      {missing.length > 0 && (
        <div className="sec" style={{ background: 'var(--danger-bg)' }}>
          <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 6 }}>
            {missing.length} 筆有金額但沒填類型，不會進分類小計
          </div>
          {missing.map((i) => (
            <button key={i.id} className="chip" style={{ marginRight: 4 }} onClick={() => onSelect(i.id)}>
              {i.title} · {formatTotals(itemTotals(i))}
            </button>
          ))}
        </div>
      )}

      <div className="sec">
        <span className="label">分類小計</span>
        {[...EXPENSE_CATEGORIES, '未分類'].map((cat) => {
          const totals = byCategory.get(cat)
          if (!totals) return null
          const home = toHome(totals, trip)
          const pct = grandHome ? (home / grandHome) * 100 : 0
          return (
            <div key={cat} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>
                  <span
                    className="dot"
                    style={{
                      display: 'inline-block',
                      margin: '0 6px 0 0',
                      background: cat === '未分類' ? 'var(--danger)' : `var(--cat-${cat})`,
                    }}
                  />
                  {cat}
                </span>
                <span className="mono">{formatMoney(home, trip.homeCurrency)}</span>
              </div>
              <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 3, marginTop: 4 }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    borderRadius: 3,
                    background: cat === '未分類' ? 'var(--danger)' : `var(--cat-${cat})`,
                  }}
                />
              </div>
              <div className="mono dim" style={{ fontSize: 11, marginTop: 2 }}>
                {formatTotals(totals)} · {Math.round(pct)}%
              </div>
            </div>
          )
        })}
      </div>

      <div className="sec">
        <span className="label">每日花費</span>
        {byDay.map(({ day, totals, home }, i) => (
          <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span className="dim" style={{ fontSize: 12, width: 74, flex: 'none' }}>
              D{i + 1} {shortDate(day).split(' ')[0]}
            </span>
            <div style={{ flex: 1, height: 14, background: 'var(--surface-2)', borderRadius: 3 }}>
              <div style={{ width: `${(home / dayMax) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
            </div>
            <span className="mono dim" style={{ fontSize: 11, width: 92, textAlign: 'right', flex: 'none' }}>
              {formatTotals(totals) ? formatMoney(home, trip.homeCurrency) : '—'}
            </span>
          </div>
        ))}
      </div>

      <TransportCompare trip={trip} />

      <ExpenseList items={items} onSelect={onSelect} />
    </>
  )
}

function ExpenseList({ items, onSelect }: { items: Item[]; onSelect: (id: string) => void }) {
  const withCost = useMemo(
    () =>
      items
        .filter((i) => Object.keys(itemTotals(i)).length > 0)
        .sort((a, b) => (a.date === b.date ? (a.startTime ?? '').localeCompare(b.startTime ?? '') : a.date.localeCompare(b.date))),
    [items],
  )

  return (
    <>
      <div className="dayhead" style={{ position: 'static' }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>全部支出</span>
        <span className="dim" style={{ fontSize: 12 }}>{withCost.length} 筆</span>
      </div>
      {withCost.map((i) => (
        <button key={i.id} className="row" onClick={() => onSelect(i.id)}>
          <span className="dot" style={{ background: i.category ? `var(--cat-${i.category})` : 'transparent' }} />
          <span className="rowtitle">
            {i.title}
            <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
              {shortDate(i.date)} {i.startTime ?? ''} {i.paymentStatus ? `· ${i.paymentStatus}` : ''}
            </div>
          </span>
          <span className="rowmoney">{formatTotals(itemTotals(i))}</span>
        </button>
      ))}
    </>
  )
}
