import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { Plan, Trip } from '../types'
import ConfirmButton from './ConfirmButton'
import Modal from './Modal'

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
  const allItems = useStore((s) => s.data.items)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const active = plans.find((p) => p.id === activeId)
  const planning = plans.find((p) => p.kind === 'planning')
  const actual = plans.find((p) => p.kind === 'actual')
  const itemCount = allItems.filter((i) => i.planId === actual?.id && !i.deleted).length

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
      {settingsOpen && actual && (
        <Modal
          title="版本設定"
          onCancel={() => setSettingsOpen(false)}
          onComplete={() => setSettingsOpen(false)}
        >
          <div style={{ paddingTop: 12 }}>
            <span className="label">實際版</span>
            <p className="dim" style={{ fontSize: 12, margin: '0 0 10px' }}>
              刪除後會連同實際版的 {itemCount} 筆行程與回饋紀錄一起移除，規劃版不受影響。
            </p>
            <ConfirmButton
              label="刪除實際版"
              question={`確定刪除實際版與 ${itemCount} 筆行程？`}
              onConfirm={() => {
                deleteActual()
                setSettingsOpen(false)
              }}
            />
          </div>
        </Modal>
      )}

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

      {actual && (
        <button
          className="btn btn-sm"
          onClick={() => setSettingsOpen(true)}
          aria-label="版本設定"
          title="版本設定"
        >
          ⚙
        </button>
      )}
    </div>
  )
}
