import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { draftTrip, useStore } from '../store/useStore'
import { dayCount, shortDate } from '../lib/date'
import SettingsModal from '../components/SettingsModal'
import Modal from '../components/Modal'
import GearIcon from '../components/GearIcon'
import TripFields from '../components/TripFields'
import JoinTripModal from '../components/JoinTripModal'
import { tripFormValid } from '../lib/tripForm'

export default function TripsPage() {
  // selector 必須回傳穩定參照，過濾留給 useMemo，否則每次重繪都是新陣列。
  const allTrips = useStore((s) => s.data.trips)
  const trips = useMemo(() => allTrips.filter((t) => !t.deleted), [allTrips])
  const createTrip = useStore((s) => s.createTrip)
  const allPlans = useStore((s) => s.data.plans)
  const allPhotos = useStore((s) => s.data.photos)
  const pendingPhotos = useStore((s) => s.pendingPhotos)
  const navigate = useNavigate()
  const [blankForm] = useState(() => draftTrip())
  const [form, setForm] = useState(blankForm)
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const newTripDirty = JSON.stringify(form) !== JSON.stringify(blankForm)

  const closeNew = () => {
    setForm(draftTrip())
    setOpen(false)
  }

  const submit = () => {
    if (!tripFormValid(form)) return
    const { trip } = createTrip({ ...form, name: form.name.trim() })
    closeNew()
    navigate(`/trip/${trip.id}`)
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>我的旅程</strong>
        <button
          className="btn btn-sm btn-glyph"
          onClick={() => setSettingsOpen(true)}
          aria-label="設定"
        >
          <GearIcon />
        </button>
      </div>

      <div className="page-scroll">
      <div className="sec" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => setOpen(true)}>
          ＋ 新增旅程
        </button>
        <button className="btn btn-sm" onClick={() => setJoinOpen(true)}>
          ＋ 加入旅程
        </button>
      </div>

      {joinOpen && <JoinTripModal onClose={() => setJoinOpen(false)} />}

      {open && (
        <Modal
          title="新增旅程"
          onCancel={closeNew}
          onComplete={submit}
          completeLabel="建立"
          dirty={newTripDirty}
        >
          <div style={{ paddingTop: 12 }}>
            <TripFields
              form={form}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
              idPrefix="t"
            />
          </div>
        </Modal>
      )}

      {trips.length === 0 && (
        <div className="empty">還沒有旅程。按上方「＋ 新增旅程」開始。</div>
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
          {(() => {
            const actual = allPlans.find((plan) => plan.tripId === t.id && plan.kind === 'actual' && !plan.deleted)
            const hasAlbum = Boolean(actual) && (
              allPhotos.some((photo) => photo.tripId === t.id && photo.kind === 'trip' && !photo.deleted) ||
              pendingPhotos.some((photo) => photo.tripId === t.id && photo.kind === 'trip')
            )
            return hasAlbum && actual ? (
              <button
                className="trip-album-link"
                onClick={() => navigate(`/trip/${t.id}?tab=album&plan=${actual.id}`)}
              >
                相簿 ›
              </button>
            ) : null
          })()}
        </div>
      ))}
      </div>
    </div>
  )
}
