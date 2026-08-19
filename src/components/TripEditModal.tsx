import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Trip } from '../types'
import Modal from './Modal'
import TripFields from './TripFields'
import { tripFormValid, type TripForm } from '../lib/tripForm'
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
  const pendingPhotos = useStore((s) => s.pendingPhotos)
  const [form, setForm] = useState<TripForm>({
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
  const pendingPhotoCount = pendingPhotos.filter((photo) => photo.tripId === trip.id).length

  const save = () => {
    if (!tripFormValid(form)) return
    updateTrip(trip.id, { ...form, name: form.name.trim() })
    onClose()
  }

  return (
    <Modal title="編輯旅程" onCancel={onClose} onComplete={save} dirty={dirty}>
      <div style={{ display: 'grid', gap: 10, paddingTop: 12 }}>
        <TripFields
          form={form}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          idPrefix="e"
        />

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
            {pendingPhotoCount > 0 && ` 另有 ${pendingPhotoCount} 張尚未上傳的照片會從此裝置刪除。`}
          </p>
          <ConfirmButton
            label="從本機移除"
            question={`從此裝置移除 ${itemCount} 筆行程${pendingPhotoCount ? `及 ${pendingPhotoCount} 張待上傳照片` : ''}？`}
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
