import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { draftTrip, useStore } from '../store/useStore'
import { dayCount, shortDate } from '../lib/date'
import ConfirmButton from '../components/ConfirmButton'
import NumberField from '../components/NumberField'
import SettingsModal from '../components/SettingsModal'
import TripEditModal from '../components/TripEditModal'

export default function TripsPage() {
  // selector 必須回傳穩定參照，過濾留給 useMemo，否則每次重繪都是新陣列。
  const allTrips = useStore((s) => s.data.trips)
  const trips = useMemo(() => allTrips.filter((t) => !t.deleted), [allTrips])
  const createTrip = useStore((s) => s.createTrip)
  const removeTrip = useStore((s) => s.removeTrip)
  const allPlans = useStore((s) => s.data.plans)
  const allItems = useStore((s) => s.data.items)

  // 刪除前先告訴使用者會連帶刪掉幾筆，光說「確定刪除？」不足以判斷代價。
  const itemCounts = useMemo(() => {
    const planToTrip = new Map(allPlans.filter((p) => !p.deleted).map((p) => [p.id, p.tripId]))
    const counts: Record<string, number> = {}
    for (const i of allItems) {
      const tripId = planToTrip.get(i.planId)
      if (!i.deleted && tripId) counts[tripId] = (counts[tripId] ?? 0) + 1
    }
    return counts
  }, [allPlans, allItems])
  const navigate = useNavigate()
  const [form, setForm] = useState(draftTrip())
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingTripId, setEditingTripId] = useState<string | null>(null)

  const submit = () => {
    if (!form.name.trim()) return
    const { trip } = createTrip({ ...form, name: form.name.trim() })
    setForm(draftTrip())
    setOpen(false)
    navigate(`/trip/${trip.id}`)
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>我的旅程</strong>
        <button className="btn btn-sm" onClick={() => setSettingsOpen(true)} aria-label="設定">
          ⚙
        </button>
        <button className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? '取消' : '新增旅程'}
        </button>
      </div>

      {open && (
        <div className="sec" style={{ display: 'grid', gap: 10 }}>
          <div>
            <label className="label" htmlFor="t-name">
              旅程名稱
            </label>
            <input
              id="t-name"
              className="field"
              value={form.name}
              placeholder="瀨戶內海9日遊"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="label" htmlFor="t-start">
                出發日
              </label>
              <input
                id="t-start"
                type="date"
                className="field"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label" htmlFor="t-end">
                回程日
              </label>
              <input
                id="t-end"
                type="date"
                className="field"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="label" htmlFor="t-cur">
                外幣
              </label>
              <input
                id="t-cur"
                className="field"
                value={form.foreignCurrency}
                onChange={(e) => setForm({ ...form, foreignCurrency: e.target.value.toUpperCase() })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label" htmlFor="t-rate">
                匯率（換台幣）
              </label>
              <NumberField
                id="t-rate"
                className="field mono"
                value={form.rate}
                emptyAs={0}
                onChange={(v) => setForm({ ...form, rate: v ?? 0 })}
                aria-label="匯率"
              />
            </div>
          </div>
          <button className="btn btn-primary" onClick={submit}>
            建立
          </button>
        </div>
      )}

      {trips.length === 0 && !open && (
        <div className="empty">還沒有旅程。按右上角「新增旅程」開始。</div>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {editingTripId && (
        <TripEditModal
          trip={trips.find((t) => t.id === editingTripId)!}
          onClose={() => setEditingTripId(null)}
        />
      )}

      {trips.map((t) => (
        <div key={t.id} className="row" style={{ alignItems: 'center', gap: 6 }}>
          <button
            style={{ flex: 1, textAlign: 'left', minWidth: 0 }}
            onClick={() => navigate(`/trip/${t.id}`)}
          >
            <span style={{ fontSize: 15 }}>{t.name}</span>
            <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
              {shortDate(t.startDate)} – {shortDate(t.endDate)} · {dayCount(t.startDate, t.endDate)} 天 ·{' '}
              {t.foreignCurrency} {t.rate}
            </div>
          </button>
          <button className="btn btn-sm" onClick={() => setEditingTripId(t.id)}>
            編輯
          </button>
          <ConfirmButton
            label="刪除"
            question={`連同整趟 ${itemCounts[t.id] ?? 0} 筆行程刪除？`}
            onConfirm={() => removeTrip(t.id)}
          />
        </div>
      ))}
    </div>
  )
}
