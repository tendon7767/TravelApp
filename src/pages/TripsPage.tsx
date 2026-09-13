import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { draftTrip, useStore } from '../store/useStore'
import { dayCount, shortDate } from '../lib/date'
import { DEFAULT_TRIP_SORT, TRIP_SORTS, sortTrips, tripSortLabel } from '../lib/tripSort'
import SortIcon from '../components/SortIcon'
import SettingsModal from '../components/SettingsModal'
import AppVersion from '../components/AppVersion'
import Modal from '../components/Modal'
import GearIcon from '../components/GearIcon'
import TripFields from '../components/TripFields'
import JoinTripModal from '../components/JoinTripModal'
import { tripFormValid } from '../lib/tripForm'
import TabBar from '../components/TabBar'

export default function TripsPage() {
  // selector 必須回傳穩定參照，過濾留給 useMemo，否則每次重繪都是新陣列。
  const allTrips = useStore((s) => s.data.trips)
  // 標題掛使用者自己的名字：本機資料被瀏覽器清掉後名字會退回預設值，
  // 標題變回「我的旅程」就是最早看得到的徵兆。
  const memberName = useStore((s) => s.settings.memberName)
  // 排序方式是本機偏好，不上傳；比較邏輯全在 lib/tripSort。
  const tripSort = useStore((s) => s.settings.tripSort) ?? DEFAULT_TRIP_SORT
  const setTripSort = useStore((s) => s.setTripSort)
  const trips = useMemo(
    () => sortTrips(allTrips.filter((t) => !t.deleted), tripSort),
    [allTrips, tripSort],
  )
  const createTrip = useStore((s) => s.createTrip)
  const allPlans = useStore((s) => s.data.plans)
  const allPhotos = useStore((s) => s.data.photos)
  const pendingPhotos = useStore((s) => s.pendingPhotos)
  const navigate = useNavigate()
  /*
   * 底部導航列在這一頁也留著，另外三格指的是「最近看的那趟」。
   * 沒有紀錄（或那趟已經不在）就退回列表最上面那一趟 —— 那三格永遠要有目的地，
   * 而畫面上被高亮的那一列，就是點下去會進到的地方。
   */
  const activeTripId = useStore((s) => s.settings.activeTripId)
  const activeTrip = trips.find((t) => t.id === activeTripId) ?? trips[0]
  const [blankForm] = useState(() => draftTrip())
  const [form, setForm] = useState(blankForm)
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const newTripDirty = JSON.stringify(form) !== JSON.stringify(blankForm)

  /*
   * 彈窗的高度上限切齊頂列，所以頂列有多高得量出來 —— 兩頁的 .topbar 有同一條
   * min-height，但字型放大或內容換行時還是會長高，硬寫數字必然對不準。
   * 旅程頁自己也量一份（TripPage）；這裡不量的話，從首頁開的彈窗會用到上一次
   * 離開旅程頁留下的舊值。
   */
  const topbarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const topbar = topbarRef.current
    if (!topbar) return
    const sync = () => {
      document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(topbar)
    return () => ro.disconnect()
  }, [])

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
      <div className="topbar" ref={topbarRef}>
        <strong
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 16,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {(memberName.trim() || '我')}的旅程
        </strong>
        <button
          className="btn btn-sm btn-glyph btn-plain"
          onClick={() => setSettingsOpen(true)}
          aria-label="設定"
        >
          <GearIcon size={22} />
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
        {/* 帶著目前的排序名稱：純圖示看不出「現在是哪一種」，會變成要點開才知道。 */}
        <button
          className="btn btn-sm trip-sort-btn"
          onClick={() => setSortOpen(true)}
          aria-label={`旅程排序，目前為${tripSortLabel(tripSort)}`}
        >
          <SortIcon size={14} />
          <span>{tripSortLabel(tripSort)}</span>
        </button>
      </div>

      {/* 選一個就生效並關閉，所以是 picker 不是編輯型彈窗：沒有草稿，也就沒有取消／儲存。 */}
      {sortOpen && (
        <Modal title="旅程排序" onCancel={() => setSortOpen(false)} variant="picker">
          <div className="picker-body">
            <div className="picker-list">
              {TRIP_SORTS.map((option) => (
                <button
                  key={option.key}
                  className="picker-row"
                  data-current={option.key === tripSort || undefined}
                  onClick={() => {
                    setTripSort(option.key)
                    setSortOpen(false)
                  }}
                >
                  <span className="picker-row-head">
                    <span className="picker-row-name">{option.label}</span>
                  </span>
                  <span className="dim" style={{ fontSize: 12 }}>{option.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {joinOpen && <JoinTripModal onClose={() => setJoinOpen(false)} />}

      {open && (
        <Modal
          title="新增旅程"
          onCancel={closeNew}
          onComplete={submit}
          completeLabel="新增"
          completeDisabled={!tripFormValid(form)}
          dirty={newTripDirty}
        >
          <TripFields
            form={form}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            idPrefix="t"
          />
        </Modal>
      )}

      {trips.length === 0 && (
        <div className="empty">還沒有旅程。按上方「＋ 新增旅程」開始。</div>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {trips.map((t) => (
        <div
          key={t.id}
          className="row"
          data-on={t.id === activeTrip?.id}
          style={{ alignItems: 'center' }}
        >
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

      {/* 置底固定：開發期間常常要在手機上抓新版，藏在設定頁裡太深。 */}
      <div className="sec app-version-bar">
        <AppVersion />
      </div>

      <TabBar
        active="home"
        tripDisabled={!activeTrip}
        onSelect={(key) => {
          if (key === 'home' || !activeTrip) return
          navigate(`/trip/${activeTrip.id}?tab=${key}`)
        }}
      />
    </div>
  )
}
