import { useStore } from '../store/useStore'
import type { Plan, Trip } from '../types'

interface Props {
  trip: Trip
  plans: Plan[]
  activeId?: string
  onPick: (id: string) => void
}

/**
 * 版本建立與切換集中在旅程設定，不再占用行程頁頂端空間。
 * 只有規劃版與實際版兩個選項，攤開成二選一的按鈕組 ——
 * 原生選單在 iOS 是整頁滾輪，為兩個選項太重，而且選完才知道自己選了什麼。
 */
export default function PlanSwitcher({ trip, plans, activeId, onPick }: Props) {
  const duplicatePlan = useStore((s) => s.duplicatePlan)

  const active = plans.find((p) => p.id === activeId)
  const planning = plans.find((p) => p.kind === 'planning')
  const actual = plans.find((p) => p.kind === 'actual')

  const createActual = () => {
    const source = active ?? planning
    if (!source) return
    const created = duplicatePlan(source.id, '實際版', 'actual')
    if (created) onPick(created.id)
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <div className="seg" role="group" aria-label={`${trip.name} 的行程版本`}>
        {plans.map((p) => (
          <button
            key={p.id}
            className="seg-btn"
            aria-pressed={p.id === activeId}
            onClick={() => onPick(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      {!actual && (
        <button className="btn btn-sm" onClick={createActual} title="從規劃版複製一份實際版">
          建立實際版
        </button>
      )}
    </div>
  )
}
