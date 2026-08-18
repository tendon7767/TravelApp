import { useStore } from '../store/useStore'
import type { Plan, Trip } from '../types'

interface Props {
  trip: Trip
  plans: Plan[]
  activeId?: string
  onPick: (id: string) => void
}

/** 版本建立與切換集中在行程設定，不再占用行程頁頂端空間。 */
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
      <select
        className="field"
        style={{ width: 150, fontWeight: 600 }}
        value={activeId ?? ''}
        onChange={(e) => onPick(e.target.value)}
        aria-label={`${trip.name} 的行程版本`}
        title={`目前：${active?.kind === 'actual' ? '實際版' : '規劃版'}`}
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {!actual && (
        <button className="btn btn-sm" onClick={createActual} title="從規劃版複製一份實際版">
          建立實際版
        </button>
      )}
    </div>
  )
}
