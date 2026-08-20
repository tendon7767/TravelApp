import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import ItineraryTab from '../components/ItineraryTab'
import ReviewTab from '../components/ReviewTab'
import ItemDetail from '../components/ItemDetail'
import TripSettingsTab from '../components/TripSettingsTab'
import TripIcon from '../components/TripIcon'
import SearchPanel from '../components/SearchPanel'
import ExpensesTab from '../components/ExpensesTab'
import RewardsTab from '../components/RewardsTab'
import NotesTab from '../components/NotesTab'
import Modal from '../components/Modal'
import type { Item } from '../types'
import { copyItemSnapshot } from '../lib/items'
import AlbumView from '../components/AlbumView'
import BackIcon from '../components/BackIcon'
import SearchIcon from '../components/SearchIcon'
import CloseIcon from '../components/CloseIcon'
import ItineraryIcon from '../components/ItineraryIcon'
import ReviewIcon from '../components/ReviewIcon'
import RewardsIcon from '../components/RewardsIcon'
import NotesIcon from '../components/NotesIcon'

// 花費統計不常看，從導航列移走，改由行程頁的「全程合計」點進去。
const TABS = [
  { key: 'itinerary', label: '行程', Icon: ItineraryIcon },
  { key: 'rewards', label: '回饋', Icon: RewardsIcon },
  { key: 'notes', label: '筆記', Icon: NotesIcon },
  { key: 'trip', label: '旅程', Icon: TripIcon },
] as const

export default function TripPage() {
  const { tripId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [detailDirty, setDetailDirty] = useState(false)
  const [tripDirty, setTripDirty] = useState(false)
  const [reviewDirty, setReviewDirty] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
  const [copied, setCopied] = useState<{ tripId: string; item: Item } | null>(null)
  const topbarRef = useRef<HTMLDivElement>(null)

  const trip = useStore((s) => s.data.trips.find((t) => t.id === tripId && !t.deleted))
  const hasAnyTrip = useStore((s) => s.data.trips.some((t) => !t.deleted))
  const linked = useStore((s) => Boolean(tripId && s.settings.tripLinks?.[tripId]))
  const sync = useStore((s) => s.sync)
  const syncTrip = useStore((s) => s.syncTrip)
  const localRev = useStore((s) => s.localRev)
  const dismissOverwritten = useStore((s) => s.dismissOverwritten)
  const duplicateItem = useStore((s) => s.duplicateItem)
  const allPlans = useStore((s) => s.data.plans)
  const plans = useMemo(
    () => allPlans.filter((p) => p.tripId === tripId && !p.deleted),
    [allPlans, tripId],
  )

  const tab = params.get('tab') ?? 'itinerary'
  const selectedId = params.get('sel')
  const searching = params.get('q') === '1'
  const preferredPlan = useMemo(
    () => plans.find((p) => p.kind === 'actual') ?? plans.find((p) => p.kind === 'planning') ?? plans[0],
    [plans],
  )
  const planId = params.get('plan') ?? preferredPlan?.id
  // 沒指定版本或網址指向已刪除版本時，有實際版就優先顯示，否則退回規劃版。
  const plan = useMemo(
    () => plans.find((p) => p.id === planId) ?? preferredPlan,
    [plans, planId, preferredPlan],
  )
  const actualPlan = useMemo(() => plans.find((value) => value.kind === 'actual'), [plans])
  // 心得只有實際版有，網址殘留 mode=review 但切回規劃版時要自動退回一般列表。
  const reviewMode = params.get('mode') === 'review' && plan?.kind === 'actual'
  const copiedItem = copied && copied.tripId === tripId && copied.item.planId === plan?.id
    ? copied.item
    : undefined

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

  /*
   * 進入、切回、恢復網路時立即同步；切走前再推一次，避免「改完就鎖螢幕」的修改卡在裝置裡。
   * 輪詢只是這些觸發點都沒發生時的保底，所以間隔可以很長：syncTrip 本身是 pull→push，
   * 每次本機編輯都已經帶著一次 pull，編輯期不缺遠端資料。真正靠輪詢的只有
   * 「開著頁面完全沒動、而同行者剛好在改」這一種情況 —— 兩分鐘是人開始懷疑壞掉、
   * 伸手去點匯率旁那個手動同步的時間。
   */
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
    const poll = window.setInterval(syncIfVisible, 120_000)
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

  /** 詳細行程、心得與旅程設定都是「改完按儲存」，未存就離開一律走這裡攔。 */
  const unsaved = (selectedId && detailDirty) || tripDirty || reviewDirty

  const requestNavigation = (action: () => void) => {
    if (unsaved) setPendingNavigation(() => action)
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

  /*
   * 同步狀態接在匯率後面顯示，本身就是手動同步的按鈕。
   * 自動同步很頻繁，獨立的圖示鍵大半時間是 disabled，看起來像壞掉。
   */
  const syncLabel = !online
    ? '離線'
    : sync.busy
      ? '同步中…'
      : sync.error
        ? '同步失敗'
        : sync.lastAt
          ? `同步於 ${new Date(sync.lastAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
          : '尚未同步'

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
            setTripDirty(false)
            setReviewDirty(false)
            action()
          }}
          cancelLabel="繼續編輯"
          completeLabel="放棄變更"
          completeDanger
        >
          <p style={{ margin: '12px 0 0' }}>
            {selectedId && detailDirty ? '詳細行程' : reviewDirty ? '心得' : '旅程設定'}有尚未儲存的修改，確定要離開嗎？
          </p>
        </Modal>
      )}
      <div className="topbar" ref={topbarRef}>
        <button
          className="btn btn-sm btn-glyph"
          onClick={() => requestNavigation(() => navigate('/'))}
          aria-label="回到旅程列表"
        >
          <BackIcon />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {trip.name}
          </div>
          <div className="dim" style={{ fontSize: 11 }}>
            {trip.foreignCurrency} 匯率 {trip.rate}
            {linked && (
              <>
                {' · '}
                <button
                  className="topbar-sync"
                  onClick={() => tripId && void syncTrip(tripId)}
                  disabled={sync.busy || !online}
                  data-bad={Boolean(online && sync.error)}
                  title={
                    !online
                      ? '目前離線，恢復網路後會自動同步'
                      : (sync.error ?? '點一下立刻同步')
                  }
                >
                  {syncLabel}
                </button>
              </>
            )}
          </div>
        </div>
        {tab === 'itinerary' && !searching && plan?.kind === 'actual' && (
          <button
            className="btn btn-sm btn-glyph"
            data-on={reviewMode}
            onClick={() => navigateParam('mode', reviewMode ? undefined : 'review')}
            aria-label={reviewMode ? '離開心得模式' : '心得模式'}
            aria-pressed={reviewMode}
          >
            <ReviewIcon size={20} />
          </button>
        )}
        <button
          className="btn btn-sm btn-glyph"
          onClick={() => navigateParam('q', searching ? undefined : '1')}
          aria-label={searching ? '關閉搜尋' : '搜尋'}
        >
          {searching ? <CloseIcon /> : <SearchIcon />}
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
            <div className="pane-scroll">
              <SearchPanel
                plan={plan}
                onPick={(id) => navigateParam('sel', id)}
                onClose={() => navigateParam('q')}
              />
            </div>
          )}
          {!searching && tab === 'itinerary' && plan && reviewMode && (
            <ReviewTab trip={trip} plan={plan} onDirtyChange={setReviewDirty} />
          )}
          {!searching && tab === 'itinerary' && plan && !reviewMode && (
            <ItineraryTab
              trip={trip}
              plan={plan}
              selectedId={selectedId}
              copiedItem={copiedItem}
              onSelect={(id) => navigateParam('sel', id)}
              onPaste={(date) => {
                if (copiedItem) duplicateItem(copiedItem, plan.id, date)
              }}
              onClearCopied={() => setCopied(null)}
              onOpenExpenses={() => navigateParam('tab', 'expenses')}
            />
          )}
          {!searching && tab === 'expenses' && plan && (
            <div className="pane-scroll">
              <ExpensesTab
                trip={trip}
                plan={plan}
                onSelect={(id) => navigateParam('sel', id)}
                onBack={() => navigateParam('tab', 'itinerary')}
              />
            </div>
          )}
          {!searching && tab === 'rewards' && (
            <div className="pane-scroll">
              <RewardsTab trip={trip} plan={plan} onSelect={(id) => navigateParam('sel', id)} />
            </div>
          )}
          {!searching && tab === 'notes' && (
            <div className="pane-scroll">
              <NotesTab trip={trip} />
            </div>
          )}
          {!searching && tab === 'trip' && (
            <div className="pane-scroll">
              <TripSettingsTab
                trip={trip}
                activePlanId={plan?.id}
                onPickPlan={(id) => setParam('plan', id)}
                onLeave={() => navigate('/')}
                onDirtyChange={setTripDirty}
              />
            </div>
          )}
          {!searching && tab === 'album' && actualPlan && (
            <AlbumView trip={trip} plan={actualPlan} />
          )}
        </div>

        {selectedId && plan && (
          <div className="pane-detail">
            <ItemDetail
              key={selectedId}
              trip={trip}
              itemId={selectedId}
              onClose={() => setParam('sel')}
              onCopy={(item) => {
                const snapshot = copyItemSnapshot(item)
                if (!snapshot) return
                setCopied({ tripId: trip.id, item: snapshot })
                setParam('sel')
              }}
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
              next.delete('mode')
              requestNavigation(() => setParams(next, { replace: true }))
            }}
          >
            <span className="tabicon">
              <t.Icon size={21} />
            </span>
            {t.label}
          </button>
        ))}
      </div>

    </div>
  )
}
