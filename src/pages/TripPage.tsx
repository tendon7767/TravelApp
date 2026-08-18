import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import ItineraryTab from '../components/ItineraryTab'
import ItemDetail from '../components/ItemDetail'
import PlanSwitcher from '../components/PlanSwitcher'
import SearchPanel from '../components/SearchPanel'
import ExpensesTab from '../components/ExpensesTab'
import RewardsTab from '../components/RewardsTab'
import NotesTab from '../components/NotesTab'

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

  const trip = useStore((s) => s.data.trips.find((t) => t.id === tripId && !t.deleted))
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
    const el = tabbarRef.current
    if (!el) return
    const sync = () =>
      document.documentElement.style.setProperty('--tabbar-h', `${el.offsetHeight}px`)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 進入旅程與切回視窗時各同步一次。旅途中常常是切出去查地圖再切回來，
  // 那正是同行者剛改完東西的時機。
  // 另外在切走的當下推一次，否則「改完就鎖螢幕」的修改會卡在裝置裡。
  useEffect(() => {
    if (!tripId || !linked) return
    void syncTrip(tripId)
    const onFocus = () => void syncTrip(tripId)
    const onHide = () => document.visibilityState === 'hidden' && void syncTrip(tripId)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [tripId, linked, syncTrip])

  // 本機改完東西後停手幾秒就自動推上去。用 localRev 當觸發來源，
  // 同步拉回來的資料不會遞增它，所以不會自己觸發自己。
  const firstRev = useRef(localRev)
  useEffect(() => {
    if (!tripId || !linked || localRev === firstRev.current) return
    const timer = setTimeout(() => void syncTrip(tripId), 6000)
    return () => clearTimeout(timer)
  }, [localRev, tripId, linked, syncTrip])

  // 手機版詳細頁是覆蓋在上面的固定層，底下的行程仍會跟著手勢捲動。
  useEffect(() => {
    document.body.classList.toggle('detail-open', Boolean(selectedId))
    return () => document.body.classList.remove('detail-open')
  }, [selectedId])

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  if (!trip) return <div className="empty">找不到這趟旅程。</div>

  return (
    <div className="app" data-actual={plan?.kind === 'actual'}>
      <div className="topbar">
        <button className="btn btn-sm" onClick={() => navigate('/')} aria-label="回到旅程列表">
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {trip.name}
          </div>
          <div className="dim" style={{ fontSize: 11 }}>
            {trip.foreignCurrency} 匯率 {trip.rate}
          </div>
        </div>
        {linked && (
          <button
            className="btn btn-sm"
            onClick={() => tripId && void syncTrip(tripId)}
            disabled={sync.busy}
            aria-label="同步"
            title={sync.error ?? (sync.lastAt ? `上次同步 ${new Date(sync.lastAt).toLocaleTimeString('zh-TW')}` : '尚未同步')}
            style={sync.error ? { color: 'var(--danger)' } : undefined}
          >
            {sync.busy ? '⋯' : sync.error ? '⚠' : '⟳'}
          </button>
        )}
        <button
          className="btn btn-sm"
          onClick={() => setParam('q', searching ? undefined : '1')}
          aria-label="搜尋"
        >
          {searching ? '✕' : '⌕'}
        </button>
        <PlanSwitcher trip={trip} plans={plans} activeId={plan?.id} onPick={(id) => setParam('plan', id)} />
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
            <SearchPanel
              plan={plan}
              onPick={(id) => setParam('sel', id)}
              onClose={() => setParam('q')}
            />
          )}
          {!searching && tab === 'itinerary' && plan && (
            <ItineraryTab
              trip={trip}
              plan={plan}
              selectedId={selectedId}
              onSelect={(id) => setParam('sel', id)}
              onOpenExpenses={() => setParam('tab', 'expenses')}
            />
          )}
          {!searching && tab === 'expenses' && plan && (
            <ExpensesTab
              trip={trip}
              plan={plan}
              onSelect={(id) => setParam('sel', id)}
              onBack={() => setParam('tab', 'itinerary')}
            />
          )}
          {!searching && tab === 'rewards' && (
            <RewardsTab trip={trip} onSelect={(id) => setParam('sel', id)} />
          )}
          {!searching && tab === 'notes' && <NotesTab trip={trip} />}
        </div>

        {selectedId && plan && (
          <div className="pane-detail">
            <ItemDetail trip={trip} itemId={selectedId} onClose={() => setParam('sel')} />
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
              setParams(next, { replace: true })
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
