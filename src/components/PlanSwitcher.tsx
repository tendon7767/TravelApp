import { useStore } from '../store/useStore'
import type { Plan, Trip } from '../types'

interface Props {
  trip: Trip
  plans: Plan[]
  activeId?: string
  onPick: (id: string) => void
}

/** 版本只做複製與切換：出發後另開實際版，保護原案不被改壞。 */
export default function PlanSwitcher({ trip, plans, activeId, onPick }: Props) {
  const duplicatePlan = useStore((s) => s.duplicatePlan)
  const active = plans.find((p) => p.id === activeId)
  const hasActual = plans.some((p) => p.kind === 'actual')

  const fork = () => {
    if (!active) return
    const name = hasActual ? `方案 ${String.fromCharCode(64 + plans.length)}` : '實際版'
    const kind = hasActual ? 'planning' : 'actual'
    const created = duplicatePlan(active.id, name, kind)
    if (created) onPick(created.id)
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select
        className="chip chip-accent"
        value={activeId ?? ''}
        onChange={(e) => onPick(e.target.value)}
        aria-label={`${trip.name} 的行程版本`}
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className="btn btn-sm" onClick={fork} title="複製目前版本">
        複製
      </button>
    </div>
  )
}
