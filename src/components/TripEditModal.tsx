import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Trip } from '../types'
import { dayCount } from '../lib/date'
import Modal from './Modal'
import NumberField from './NumberField'
import SyncSection from './SyncSection'
import ConfirmButton from './ConfirmButton'
import PlanSwitcher from './PlanSwitcher'

/** 縮短日期範圍會讓範圍外的項目變成看不到的孤兒，所以先數給使用者看。 */
export default function TripEditModal({
  trip,
  activePlanId,
  onPickPlan,
  onClose,
}: {
  trip: Trip
  activePlanId?: string
  onPickPlan: (id: string) => void
  onClose: () => void
}) {
  const updateTrip = useStore((s) => s.updateTrip)
  const removeTrip = useStore((s) => s.removeTrip)
  const removePlan = useStore((s) => s.removePlan)
  const allPlans = useStore((s) => s.data.plans)
  const allItems = useStore((s) => s.data.items)
  const [form, setForm] = useState({
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    foreignCurrency: trip.foreignCurrency,
    rate: trip.rate,
  })
  const dirty =
    form.name !== trip.name ||
    form.startDate !== trip.startDate ||
    form.endDate !== trip.endDate ||
    form.foreignCurrency !== trip.foreignCurrency ||
    form.rate !== trip.rate

  const stranded = useMemo(() => {
    const planIds = new Set(allPlans.filter((p) => p.tripId === trip.id && !p.deleted).map((p) => p.id))
    return allItems.filter(
      (i) => !i.deleted && planIds.has(i.planId) && (i.date < form.startDate || i.date > form.endDate),
    ).length
  }, [allPlans, allItems, trip.id, form.startDate, form.endDate])

  const itemCount = useMemo(() => {
    const planIds = new Set(allPlans.filter((p) => p.tripId === trip.id && !p.deleted).map((p) => p.id))
    return allItems.filter((i) => !i.deleted && planIds.has(i.planId)).length
  }, [allPlans, allItems, trip.id])
  const actualPlan = allPlans.find(
    (plan) => plan.tripId === trip.id && plan.kind === 'actual' && !plan.deleted,
  )
  const planningPlan = allPlans.find(
    (plan) => plan.tripId === trip.id && plan.kind === 'planning' && !plan.deleted,
  )
  const plans = allPlans.filter((plan) => plan.tripId === trip.id && !plan.deleted)
  const actualItemCount = actualPlan
    ? allItems.filter((item) => item.planId === actualPlan.id && !item.deleted).length
    : 0

  const save = () => {
    const name = form.name.trim()
    if (!name || form.endDate < form.startDate) return
    updateTrip(trip.id, { ...form, name })
    onClose()
  }

  return (
    <Modal title="編輯旅程" onCancel={onClose} onComplete={save} dirty={dirty}>
      <div style={{ display: 'grid', gap: 10, paddingTop: 12 }}>
        <div>
          <label className="label" htmlFor="e-name">旅程名稱</label>
          <input
            id="e-name"
            className="field"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor="e-start">出發日</label>
            <input
              id="e-start"
              type="date"
              className="field"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor="e-end">回程日</label>
            <input
              id="e-end"
              type="date"
              className="field"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor="e-cur">外幣</label>
            <input
              id="e-cur"
              className="field"
              value={form.foreignCurrency}
              onChange={(e) => setForm({ ...form, foreignCurrency: e.target.value.toUpperCase() })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor="e-rate">匯率（換台幣）</label>
            <NumberField
              id="e-rate"
              className="field mono"
              value={form.rate}
              emptyAs={0}
              onChange={(v) => setForm({ ...form, rate: v ?? 0 })}
              aria-label="匯率"
            />
          </div>
        </div>

        <p className="dim" style={{ fontSize: 12, margin: 0 }}>
          共 {form.endDate >= form.startDate ? dayCount(form.startDate, form.endDate) : 0} 天。
          改匯率會讓所有台幣換算金額重算。
        </p>

        {form.endDate < form.startDate && (
          <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>回程日不能早於出發日。</p>
        )}

        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <span className="label">目前檢視版本</span>
          <PlanSwitcher
            trip={trip}
            plans={plans}
            activeId={activePlanId}
            onPick={onPickPlan}
          />
          <p className="dim" style={{ fontSize: 11, margin: '7px 0 0' }}>
            切換後立即生效；旅程名稱與日期仍需按「完成」儲存。
          </p>
        </div>

        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <span className="label">雲端同步</span>
          <SyncSection trip={trip} />
        </div>

        {stranded > 0 && (
          <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>
            有 {stranded} 筆行程落在新的日期範圍外，儲存後會看不到（資料還在，把日期改回來就會出現）。
          </p>
        )}

        {actualPlan && (
          <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            <span className="label">實際版</span>
            <p className="dim" style={{ fontSize: 12, margin: '0 0 8px' }}>
              刪除後會連同實際版的 {actualItemCount} 筆行程與回饋紀錄一起移除，規劃版不受影響。
            </p>
            <ConfirmButton
              label="刪除實際版"
              question={`確定刪除實際版與 ${actualItemCount} 筆行程？`}
              onConfirm={() => {
                removePlan(actualPlan.id)
                if (activePlanId === actualPlan.id && planningPlan) onPickPlan(planningPlan.id)
              }}
            />
          </div>
        )}

        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <span className="label">本機資料</span>
          <p className="dim" style={{ fontSize: 12, margin: '0 0 8px' }}>
            只會從這台裝置移除，雲端資料會保留；之後重新開啟邀請連結即可加入相同旅程。
          </p>
          <ConfirmButton
            label="從本機移除"
            question={`從此裝置移除 ${itemCount} 筆行程？`}
            confirmLabel="移除"
            onConfirm={() => {
              removeTrip(trip.id)
              onClose()
            }}
          />
        </div>
      </div>
    </Modal>
  )
}
