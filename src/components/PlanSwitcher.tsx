import { useStore } from '../store/useStore'
import type { Plan, Trip } from '../types'

interface Props {
  trip: Trip
  plans: Plan[]
  activeId?: string
  onPick: (id: string) => void
}

/** 行程頁只負責建立與切換；刪除實際版收在上一層旅程設定。 */
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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select
        className={`chip plan-switch ${active?.kind === 'actual' ? 'chip-actual' : 'chip-accent'}`}
        value={activeId ?? ''}
        onChange={(e) => onPick(e.target.value)}
        aria-label={`${trip.name} 的行程版本`}
        title={`目前：${active?.kind === 'actual' ? '實際版' : '規劃版'}`}
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.kind === 'actual' ? '實' : '規'}
          </option>
        ))}
      </select>

      {!actual && (
        <button className="btn btn-sm" onClick={createActual} title="從目前版本複製一份實際版">
          建立實際版
        </button>
      )}
    </div>
  )
}
