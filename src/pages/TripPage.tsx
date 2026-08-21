import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import ItineraryTab from '../components/ItineraryTab'
import ReviewTab from '../components/ReviewTab'
import ItemDetail from '../components/ItemDetail'
import TripSettings from '../components/TripSettings'
import KeyboardEditBar from '../components/KeyboardEditBar'
import SearchPanel from '../components/SearchPanel'
import ExpensesTab from '../components/ExpensesTab'
import RewardsTab from '../components/RewardsTab'
import NotesTab from '../components/NotesTab'
import Modal from '../components/Modal'
import type { Item } from '../types'
import { copyItemSnapshot } from '../lib/items'
import { tripFormOf, tripFormValid, type TripForm } from '../lib/tripForm'
import { useSwipeBack } from '../lib/useSwipeBack'
import AlbumView from '../components/AlbumView'
import BackIcon from '../components/BackIcon'
import TripsPage from './TripsPage'
import SearchIcon from '../components/SearchIcon'
import CloseIcon from '../components/CloseIcon'
import ItineraryIcon from '../components/ItineraryIcon'
import ReviewIcon from '../components/ReviewIcon'
import RewardsIcon from '../components/RewardsIcon'
import NotesIcon from '../components/NotesIcon'

/*
 * 花費統計不常看，從導航列移走，改由行程頁的「全程合計」點進去。
 * 旅程設定同理：進去多半只為了改名稱或日期，改完就出來，
 * 沒必要佔一格導航列 —— 改成點頂列的旅程名稱開彈窗。
 */
const TABS = [
  { key: 'itinerary', label: '行程', Icon: ItineraryIcon },
  { key: 'rewards', label: '回饋', Icon: RewardsIcon },
  { key: 'notes', label: '筆記', Icon: NotesIcon },
] as const

export default function TripPage() {
  const { tripId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [detailDirty, setDetailDirty] = useState(false)
  const [reviewDirty, setReviewDirty] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
  const [copied, setCopied] = useState<{ tripId: string; item: Item } | null>(null)
  /* 旅程基本資訊是草稿，按「完成」才寫回去；不是 null 就代表彈窗開著。 */
  const [tripDraft, setTripDraft] = useState<TripForm | null>(null)
  const topbarRef = useRef<HTMLDivElement>(null)

  const trip = useStore((s) => s.data.trips.find((t) => t.id === tripId && !t.deleted))
  const hasAnyTrip = useStore((s) => s.data.trips.some((t) => !t.deleted))
  const linked = useStore((s) => Boolean(tripId && s.settings.tripLinks?.[tripId]))
  const sync = useStore((s) => s.sync)
  const syncTrip = useStore((s) => s.syncTrip)
  const localRev = useStore((s) => s.localRev)
  const dismissOverwritten = useStore((s) => s.dismissOverwritten)
  const updateTrip = useStore((s) => s.updateTrip)
  const duplicateItem = useStore((s) => s.duplicateItem)
  const allPlans = useStore((s) => s.data.plans)
  const plans = useMemo(
    () => allPlans.filter((p) => p.tripId === tripId && !p.deleted),
    [allPlans, tripId],
  )

  // 舊版把旅程設定做成分頁，網址（或 iOS 恢復 PWA 時的殘留 hash）可能還指著它。
  const tabParam = params.get('tab') ?? 'itinerary'
  const tab = tabParam === 'trip' ? 'itinerary' : tabParam
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

  // 設定視窗、筆記、複製資料這些浮層都是 portal 到 body 的，不在 .app 底下，
  // 只掛在 .app 上的實際版配色蓋不到它們，所以同一個旗標也寫一份到 body。
  useEffect(() => {
    const actual = plan?.kind === 'actual'
    document.body.dataset.actual = String(actual)
    return () => {
      delete document.body.dataset.actual
    }
  }, [plan?.kind])

  // iOS 從主畫面恢復 PWA 時可能保留更新前的 hash 路徑。該 ID 已不存在就回列表，
  // 讓使用者選目前真正存在的旅程，不停在無法操作的錯誤頁。
  useEffect(() => {
    if (!trip) navigate('/', { replace: true })
  }, [trip, navigate])

  /** 拖曳中才把旅程列表墊在底下：滑開的時候要看得到自己正要回到哪裡。 */
  const [swipingBack, setSwipingBack] = useState(false)

  /* 詳細頁在 860px 以上是右側欄不是覆蓋層，那裡不吃關閉手勢。 */
  const [overlayDetail, setOverlayDetail] = useState(
    () => !window.matchMedia('(min-width: 860px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 860px)')
    const onChange = () => setOverlayDetail(!mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  /** 詳細行程與心得都是「改完按儲存」，未存就離開一律走這裡攔。 */
  const unsaved = (selectedId && detailDirty) || reviewDirty

  const requestNavigation = (action: () => void) => {
    if (unsaved) setPendingNavigation(() => action)
    else action()
  }

  const navigateParam = (key: string, value?: string) =>
    requestNavigation(() => setParam(key, value))

  /*
   * 往右拖曳退回上一層，跟左上角那顆返回鍵走同一條路（會攔未儲存的修改）。
   * 詳細頁蓋在旅程頁上面，兩層都掛，靠內層吃掉 touchstart 決定誰接手。
   * 日期列本來就要橫捲，起點落在它上面時放行。
   */
  const tripSwipe = useSwipeBack<HTMLDivElement>({
    onDismiss: () => requestNavigation(() => navigate('/')),
    ignoreWithin: '.daystrip',
    onDrag: setSwipingBack,
  })
  const detailSwipe = useSwipeBack<HTMLDivElement>({
    onDismiss: () => requestNavigation(() => setParam('sel')),
    disabled: !overlayDetail,
    stopPropagation: true,
  })

  if (!trip) {
    return (
      <div className="empty">
        {hasAnyTrip ? '正在回到旅程列表…' : '請重新開啟邀請連結加入旅程…'}
      </div>
    )
  }

  const tripDirty =
    tripDraft !== null && JSON.stringify(tripDraft) !== JSON.stringify(tripFormOf(trip))

  /* 名稱空白或日期顛倒就先不收，讓彈窗留著給人改（日期的錯誤訊息就在欄位底下）。 */
  const completeTripEdit = () => {
    if (!tripDraft) return
    if (!tripFormValid(tripDraft)) return
    updateTrip(trip.id, { ...tripDraft, name: tripDraft.name.trim() })
    setTripDraft(null)
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
    <>
    {swipingBack && (
      <div className="swipe-behind" aria-hidden="true" inert>
        <TripsPage />
      </div>
    )}
    <div className="app" ref={tripSwipe} data-actual={plan?.kind === 'actual'}>
      {pendingNavigation && (
        <Modal
          title="尚未儲存變更"
          onCancel={() => setPendingNavigation(null)}
          onComplete={() => {
            const action = pendingNavigation
            setPendingNavigation(null)
            setDetailDirty(false)
            setReviewDirty(false)
            action()
          }}
          cancelLabel="繼續編輯"
          completeLabel="放棄變更"
          completeDanger
        >
          <p style={{ margin: '12px 0 0' }}>
            {selectedId && detailDirty ? '詳細行程' : '心得'}有尚未儲存的修改，確定要離開嗎？
          </p>
        </Modal>
      )}
      {tripDraft && (
        <Modal
          title="編輯旅程"
          onCancel={() => setTripDraft(null)}
          onComplete={completeTripEdit}
          dirty={tripDirty}
        >
          <KeyboardEditBar value={tripDraft} onRestore={setTripDraft} />
          <TripSettings
            trip={trip}
            form={tripDraft}
            onFormChange={(patch) =>
              setTripDraft((current) => (current ? { ...current, ...patch } : current))
            }
            activePlanId={plan?.id}
            onPickPlan={(id) => setParam('plan', id)}
            onLeave={() => {
              setTripDraft(null)
              navigate('/')
            }}
          />
        </Modal>
      )}
      <div className="topbar" ref={topbarRef}>
        {/* 手機用右滑返回，這顆只留給沒有手勢的桌機。 */}
        <button
          className="btn btn-sm btn-glyph btn-plain wide-only"
          onClick={() => requestNavigation(() => navigate('/'))}
          aria-label="回到旅程列表"
        >
          <BackIcon size={22} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 旅程名稱就是旅程設定的入口。同步鍵在下一行，不能包進同一顆按鈕裡。 */}
          <button
            className="topbar-title"
            onClick={() => setTripDraft(tripFormOf(trip))}
            aria-haspopup="dialog"
          >
            {trip.name}
          </button>
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
            className="btn btn-sm btn-glyph btn-plain"
            data-on={reviewMode}
            onClick={() => navigateParam('mode', reviewMode ? undefined : 'review')}
            aria-label={reviewMode ? '離開心得模式' : '心得模式'}
            aria-pressed={reviewMode}
          >
            <ReviewIcon size={22} />
          </button>
        )}
        <button
          className="btn btn-sm btn-glyph btn-plain"
          onClick={() => navigateParam('q', searching ? undefined : '1')}
          aria-label={searching ? '關閉搜尋' : '搜尋'}
        >
          {searching ? <CloseIcon size={22} /> : <SearchIcon size={22} />}
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
          {!searching && tab === 'album' && actualPlan && (
            <AlbumView trip={trip} plan={actualPlan} />
          )}
        </div>

        {selectedId && plan && (
          <div className="pane-detail" ref={detailSwipe}>
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
    </>
  )
}
