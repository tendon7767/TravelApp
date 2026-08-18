import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import ItineraryTab from '../components/ItineraryTab'
import ItemDetail from '../components/ItemDetail'
import TripEditModal from '../components/TripEditModal'
import SearchPanel from '../components/SearchPanel'
import ExpensesTab from '../components/ExpensesTab'
import RewardsTab from '../components/RewardsTab'
import NotesTab from '../components/NotesTab'
import Modal from '../components/Modal'
import ElasticScroll from '../components/ElasticScroll'

// 花費統計不常看，從導航列移走，改由行程頁的「全程合計」點進去。
const TABS = [
  { key: 'itinerary', label: '行程', icon: '☰' },
  { key: 'rewards', label: '回饋', icon: '%' },
  { key: 'notes', label: '筆記', icon: '✎' },
] as const

export default function TripPage() {
  const { tripId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [detailDirty, setDetailDirty] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
  const [tripSettingsOpen, setTripSettingsOpen] = useState(false)
  const topbarRef = useRef<HTMLDivElement>(null)

  const trip = useStore((s) => s.data.trips.find((t) => t.id === tripId && !t.deleted))
  const hasAnyTrip = useStore((s) => s.data.trips.some((t) => !t.deleted))
  const linked = useStore((s) => Boolean(tripId && s.settings.tripLinks?.[tripId]))
  const sync = useStore((s) => s.sync)
  const syncTrip = useStore((s) => s.syncTrip)
  const localRev = useStore((s) => s.localRev)
  const dismissOverwritten = useStore((s) => s.dismissOverwritten)
  const allPlans = useStore((s) => s.data.plans)
  const plans = useMemo(
    () => allPlans.filter((p) => p.tripId === tripId && !p.deleted),
    [allPlans, tripId],
  )

  const tab = params.get('tab') ?? 'itinerary'
  const selectedId = params.get('sel')
  const searching = params.get('q') === '1'
  const planId = params.get('plan') ?? plans[0]?.id
  // 刪掉版本後網址參數會指向已消失的版本，退回第一個可用的，不要留白畫面。
  const plan = useMemo(() => plans.find((p) => p.id === planId) ?? plans[0], [plans, planId])

  // 導航列高度會隨字型與安全區變動，硬寫數字必然對不準，量到多少就是多少。
  const tabbarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const topbar = topbarRef.current
    const tabbar = tabbarRef.current
    if (!topbar || !tabbar) return
    const sync = () => {
      document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`)
      document.documentElement.style.setProperty('--tabbar-h', `${tabbar.offsetHeight}px`)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(topbar)
    ro.observe(tabbar)
    return () => ro.disconnect()
  }, [])

  // 可見時每 15 秒同步同行者的更新；背景停止輪詢。進入、切回、恢復網路時立即同步，
  // 切走前再推一次，避免「改完就鎖螢幕」的修改卡在裝置裡。
  useEffect(() => {
    if (!tripId || !linked) return
    const syncIfVisible = () => {
      if (navigator.onLine && document.visibilityState === 'visible') void syncTrip(tripId)
    }
    const onFocus = () => syncIfVisible()
    const onVisibility = () => {
      if (!navigator.onLine) return
      if (document.visibilityState === 'hidden') void syncTrip(tripId)
      else syncIfVisible()
    }
    const onOnline = () => {
      setOnline(true)
      syncIfVisible()
    }
    const onOffline = () => setOnline(false)

    syncIfVisible()
    const poll = window.setInterval(syncIfVisible, 15_000)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(poll)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [tripId, linked, syncTrip])

  // 本機停止編輯 2 秒就同步。用 localRev 當觸發來源，
  // 同步拉回來的資料不會遞增它，所以不會自己觸發自己。
  const firstRev = useRef(localRev)
  useEffect(() => {
    if (!tripId || !linked || localRev === firstRev.current) return
    const timer = setTimeout(() => navigator.onLine && void syncTrip(tripId), 2000)
    return () => clearTimeout(timer)
  }, [localRev, tripId, linked, syncTrip])

  // 手機版詳細頁是覆蓋在上面的固定層，底下的行程仍會跟著手勢捲動。
  useEffect(() => {
    document.body.classList.toggle('detail-open', Boolean(selectedId))
    return () => document.body.classList.remove('detail-open')
  }, [selectedId])

  // iOS 從主畫面恢復 PWA 時可能保留更新前的 hash 路徑。該 ID 已不存在就回列表，
  // 讓使用者選目前真正存在的旅程，不停在無法操作的錯誤頁。
  useEffect(() => {
    if (!trip) navigate('/', { replace: true })
  }, [trip, navigate])

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const requestNavigation = (action: () => void) => {
    if (selectedId && detailDirty) setPendingNavigation(() => action)
    else action()
  }

  const navigateParam = (key: string, value?: string) =>
    requestNavigation(() => setParam(key, value))

  if (!trip) {
    return (
      <div className="empty">
        {hasAnyTrip ? '正在回到旅程列表…' : '請重新開啟邀請連結加入旅程…'}
      </div>
    )
  }

  return (
    <div className="app" data-actual={plan?.kind === 'actual'}>
      {pendingNavigation && (
        <Modal
          title="尚未儲存變更"
          onCancel={() => setPendingNavigation(null)}
          onComplete={() => {
            const action = pendingNavigation
            setPendingNavigation(null)
            setDetailDirty(false)
            action()
          }}
          cancelLabel="繼續編輯"
          completeLabel="放棄變更"
          completeDanger
        >
          <p style={{ margin: '12px 0 0' }}>詳細行程有尚未儲存的修改，確定要離開嗎？</p>
        </Modal>
      )}
      {tripSettingsOpen && (
        <TripEditModal
          trip={trip}
          activePlanId={plan?.id}
          onPickPlan={(id) => setParam('plan', id)}
          onClose={() => setTripSettingsOpen(false)}
        />
      )}

      <div className="topbar" ref={topbarRef}>
        <button
          className="btn btn-sm"
          onClick={() => requestNavigation(() => navigate('/'))}
          aria-label="回到旅程列表"
        >
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {trip.name}
          </div>
          <div className="dim" style={{ fontSize: 11 }}>
            {trip.foreignCurrency} 匯率 {trip.rate}
            {linked && !online && ' · 離線'}
            {linked && online && !sync.busy && sync.error && ' · 同步失敗'}
          </div>
        </div>
        {linked && (
          <button
            className="btn btn-sm"
            onClick={() => tripId && void syncTrip(tripId)}
            disabled={sync.busy || !online}
            aria-label={sync.busy ? '同步中' : '同步'}
            title={
              !online
                ? '目前離線，恢復網路後會自動同步'
                : sync.error ??
                  (sync.lastAt
                    ? `上次同步 ${new Date(sync.lastAt).toLocaleTimeString('zh-TW')}`
                    : '尚未同步')
            }
            style={sync.error && online ? { color: 'var(--danger)' } : undefined}
          >
            {!online ? '○' : sync.busy ? '同步中…' : sync.error ? '⚠' : '⟳'}
          </button>
        )}
        <button
          className="btn btn-sm"
          onClick={() => navigateParam('q', searching ? undefined : '1')}
          aria-label="搜尋"
        >
          {searching ? '✕' : '⌕'}
        </button>
        <button
          className="btn btn-sm"
          onClick={() =>
            requestNavigation(() => {
              setParam('sel')
              setTripSettingsOpen(true)
            })
          }
          aria-label="行程設定"
          title="行程設定"
        >
          ⚙
        </button>
      </div>

      {sync.overwritten.length > 0 && (
        <div className="sec" style={{ background: 'var(--accent-bg)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: 12 }}>
            有 {sync.overwritten.length} 筆被 {sync.overwritten[0].by} 的較新版本更新
          </span>
          <button className="btn btn-sm" onClick={dismissOverwritten}>知道了</button>
        </div>
      )}

      <div className="split">
        <div className="pane-list">
          {searching && plan && (
            <ElasticScroll className="pane-scroll">
              <SearchPanel
                plan={plan}
                onPick={(id) => navigateParam('sel', id)}
                onClose={() => navigateParam('q')}
              />
            </ElasticScroll>
          )}
          {!searching && tab === 'itinerary' && plan && (
            <ItineraryTab
              trip={trip}
              plan={plan}
              selectedId={selectedId}
              onSelect={(id) => navigateParam('sel', id)}
              onOpenExpenses={() => navigateParam('tab', 'expenses')}
            />
          )}
          {!searching && tab === 'expenses' && plan && (
            <ElasticScroll className="pane-scroll">
              <ExpensesTab
                trip={trip}
                plan={plan}
                onSelect={(id) => navigateParam('sel', id)}
                onBack={() => navigateParam('tab', 'itinerary')}
              />
            </ElasticScroll>
          )}
          {!searching && tab === 'rewards' && (
            <ElasticScroll className="pane-scroll">
              <RewardsTab trip={trip} plan={plan} onSelect={(id) => navigateParam('sel', id)} />
            </ElasticScroll>
          )}
          {!searching && tab === 'notes' && (
            <ElasticScroll className="pane-scroll">
              <NotesTab trip={trip} />
            </ElasticScroll>
          )}
        </div>

        {selectedId && plan && (
          <div className="pane-detail">
            <ItemDetail
              key={selectedId}
              trip={trip}
              itemId={selectedId}
              onClose={() => setParam('sel')}
              onDirtyChange={setDetailDirty}
            />
          </div>
        )}
      </div>

      <div className="tabbar" ref={tabbarRef}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className="tab"
            data-on={tab === t.key}
            onClick={() => {
              const next = new URLSearchParams(params)
              next.set('tab', t.key)
              next.delete('sel')
              next.delete('q')
              requestNavigation(() => setParams(next, { replace: true }))
            }}
          >
            <span className="tabicon" aria-hidden="true">
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </div>

    </div>
  )
}
