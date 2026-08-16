import { useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import ItineraryTab from '../components/ItineraryTab'
import ItemDetail from '../components/ItemDetail'
import PlanSwitcher from '../components/PlanSwitcher'

const TABS = [
  { key: 'itinerary', label: '行程', icon: '☰' },
  { key: 'expenses', label: '花費', icon: '$' },
  { key: 'rewards', label: '回饋', icon: '%' },
  { key: 'notes', label: '筆記', icon: '✎' },
] as const

export default function TripPage() {
  const { tripId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const trip = useStore((s) => s.data.trips.find((t) => t.id === tripId && !t.deleted))
  const allPlans = useStore((s) => s.data.plans)
  const plans = useMemo(
    () => allPlans.filter((p) => p.tripId === tripId && !p.deleted),
    [allPlans, tripId],
  )

  const tab = params.get('tab') ?? 'itinerary'
  const selectedId = params.get('sel')
  const planId = params.get('plan') ?? plans[0]?.id
  // 刪掉版本後網址參數會指向已消失的版本，退回第一個可用的，不要留白畫面。
  const plan = useMemo(() => plans.find((p) => p.id === planId) ?? plans[0], [plans, planId])

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
        <PlanSwitcher trip={trip} plans={plans} activeId={plan?.id} onPick={(id) => setParam('plan', id)} />
      </div>

      <div className="split">
        <div className="pane-list">
          {tab === 'itinerary' && plan && (
            <ItineraryTab
              trip={trip}
              plan={plan}
              selectedId={selectedId}
              onSelect={(id) => setParam('sel', id)}
            />
          )}
          {tab !== 'itinerary' && (
            <div className="empty">
              「{TABS.find((t) => t.key === tab)?.label}」在後續里程碑製作。
            </div>
          )}
        </div>

        {selectedId && plan && (
          <div className="pane-detail">
            <ItemDetail trip={trip} itemId={selectedId} onClose={() => setParam('sel')} />
          </div>
        )}
      </div>

      <div className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className="tab" data-on={tab === t.key} onClick={() => setParam('tab', t.key)}>
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
