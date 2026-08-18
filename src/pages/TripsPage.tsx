import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { draftTrip, useStore } from '../store/useStore'
import { dayCount, shortDate } from '../lib/date'
import NumberField from '../components/NumberField'
import SettingsModal from '../components/SettingsModal'
import Modal from '../components/Modal'

export default function TripsPage() {
  // selector 必須回傳穩定參照，過濾留給 useMemo，否則每次重繪都是新陣列。
  const allTrips = useStore((s) => s.data.trips)
  const trips = useMemo(() => allTrips.filter((t) => !t.deleted), [allTrips])
  const createTrip = useStore((s) => s.createTrip)
  const navigate = useNavigate()
  const [blankForm] = useState(() => draftTrip())
  const [form, setForm] = useState(blankForm)
  const [open, setOpen] = useState(false)
  const [confirmingNewCancel, setConfirmingNewCancel] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const newTripDirty = JSON.stringify(form) !== JSON.stringify(blankForm)

  const submit = () => {
    if (!form.name.trim()) return
    const { trip } = createTrip({ ...form, name: form.name.trim() })
    setForm(draftTrip())
    setOpen(false)
    navigate(`/trip/${trip.id}`)
  }

  return (
    <div className="app">
      {confirmingNewCancel && (
        <Modal
          title="尚未儲存變更"
          onCancel={() => setConfirmingNewCancel(false)}
          onComplete={() => {
            setForm(draftTrip())
            setOpen(false)
            setConfirmingNewCancel(false)
          }}
          cancelLabel="繼續編輯"
          completeLabel="放棄變更"
          completeDanger
        >
          <p style={{ margin: '12px 0 0' }}>確定要取消並放棄這趟旅程的資料嗎？</p>
        </Modal>
      )}
      <div className="topbar">
        <strong style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>我的旅程</strong>
        <button className="btn btn-sm" onClick={() => setSettingsOpen(true)} aria-label="設定">
          ⚙
        </button>
        <button
          className="btn btn-sm"
          onClick={() => {
            if (!open) setOpen(true)
            else if (newTripDirty) setConfirmingNewCancel(true)
            else setOpen(false)
          }}
        >
          {open ? '取消' : '新增旅程'}
        </button>
      </div>

      <div className="page-scroll">
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
      {trips.map((t) => (
        <div key={t.id} className="row" style={{ alignItems: 'center' }}>
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
        </div>
      ))}
      </div>
    </div>
  )
}
