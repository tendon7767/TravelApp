import { useStore } from '../store/useStore'
import type { Plan, Trip } from '../types'
import ConfirmButton from './ConfirmButton'

interface Props {
  trip: Trip
  plans: Plan[]
  activeId?: string
  onPick: (id: string) => void
}

/** 版本只做建立、切換、刪除：出發後另開實際版，保護原案不被改壞。 */
export default function PlanSwitcher({ trip, plans, activeId, onPick }: Props) {
  const duplicatePlan = useStore((s) => s.duplicatePlan)
  const removePlan = useStore((s) => s.removePlan)
  const itemCount = useStore(
    (s) => s.data.items.filter((i) => i.planId === activeId && !i.deleted).length,
  )

  const active = plans.find((p) => p.id === activeId)
  const planning = plans.find((p) => p.kind === 'planning')
  const actual = plans.find((p) => p.kind === 'actual')

  const createActual = () => {
    const source = active ?? planning
    if (!source) return
    const created = duplicatePlan(source.id, '實際版', 'actual')
    if (created) onPick(created.id)
  }

  const deleteActual = () => {
    if (!actual) return
    removePlan(actual.id)
    if (planning) onPick(planning.id)
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select
        className={active?.kind === 'actual' ? 'chip chip-actual' : 'chip chip-accent'}
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

      {!actual && (
        <button className="btn btn-sm" onClick={createActual} title="從目前版本複製一份實際版">
          建立實際版
        </button>
      )}

      {active?.kind === 'actual' && (
        <ConfirmButton
          label="刪除實際版"
          question={`連同 ${itemCount} 筆行程一起刪除，回饋紀錄也會消失？`}
          onConfirm={deleteActual}
        />
      )}
    </div>
  )
}
