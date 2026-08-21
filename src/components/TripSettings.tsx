import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import type { Trip } from '../types'
import TripFields from './TripFields'
import Modal from './Modal'
import { dayCount, shortDate } from '../lib/date'
import { tripFormOf, tripFormValid, type TripForm } from '../lib/tripForm'
import SyncSection from './SyncSection'
import ConfirmButton from './ConfirmButton'
import PlanSwitcher from './PlanSwitcher'
import { REVIEW_HUES, tagCharOf } from '../lib/reviewHues'

/**
 * 旅程本身的設定，內容放在頂列旅程名稱點開的「旅程」彈窗裡。
 * **這一頁的東西全部即時生效，關掉不會丟掉任何東西。** 唯一的草稿是基本資訊，
 * 而它被收進另一個彈窗裡（點「編輯」才開），草稿的生死也就關在那個彈窗裡 ——
 * 所以外層不需要取消／儲存，底部是一條「關閉」。
 */
export default function TripSettings({
  trip,
  activePlanId,
  onPickPlan,
  onLeave,
}: {
  trip: Trip
  activePlanId?: string
  onPickPlan: (id: string) => void
  /** 旅程被移除後要離開這一頁。 */
  onLeave: () => void
}) {
  const updateTrip = useStore((s) => s.updateTrip)
  const removeTrip = useStore((s) => s.removeTrip)
  const removePlan = useStore((s) => s.removePlan)
  const allPlans = useStore((s) => s.data.plans)
  const allItems = useStore((s) => s.data.items)
  const pendingPhotos = useStore((s) => s.pendingPhotos)
  const allReviews = useStore((s) => s.data.reviews)
  const reviewHues = useStore((s) => s.settings.reviewHues?.[trip.id])
  const setReviewHue = useStore((s) => s.setReviewHue)
  /* 基本資訊的草稿只在那個彈窗開著時存在。null 就是沒在編輯。 */
  const [draft, setDraft] = useState<TripForm | null>(null)
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(tripFormOf(trip))

  /* 縮短日期範圍會讓範圍外的項目變成看不到的孤兒，所以編輯期間先數給使用者看。 */
  const stranded = useMemo(() => {
    if (!draft) return 0
    const planIds = new Set(allPlans.filter((p) => p.tripId === trip.id && !p.deleted).map((p) => p.id))
    return allItems.filter(
      (i) => !i.deleted && planIds.has(i.planId) && (i.date < draft.startDate || i.date > draft.endDate),
    ).length
  }, [allPlans, allItems, trip.id, draft])

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

  /*
   * 這個 app 沒有帳號，也就沒有「同行者名單」可以列 ——
   * 能列的只有「這趟已經寫過心得的人」。還沒寫的人不會出現，也就沒得先配色。
   */
  const reviewAuthors = useMemo(() => {
    const planIds = new Set(allPlans.filter((p) => p.tripId === trip.id && !p.deleted).map((p) => p.id))
    const itemIds = new Set(
      allItems.filter((i) => !i.deleted && planIds.has(i.planId)).map((i) => i.id),
    )
    const names = new Set<string>()
    for (const review of allReviews) {
      if (!review.deleted && review.text.trim() && itemIds.has(review.itemId)) names.add(review.author)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [allPlans, allItems, allReviews, trip.id])

  return (
    <div style={{ display: 'grid', gap: 10 }}>
        <div className="trip-summary">
          <div className="trip-summary-lines">
            <strong className="trip-summary-name">{trip.name}</strong>
            <span className="dim">
              {shortDate(trip.startDate)} – {shortDate(trip.endDate)} ·{' '}
              {dayCount(trip.startDate, trip.endDate)} 天
            </span>
            <span className="dim">
              {trip.foreignCurrency} 匯率 {trip.rate}
            </span>
          </div>
          <button className="btn btn-sm" onClick={() => setDraft(tripFormOf(trip))}>
            編輯
          </button>
        </div>

        {/* 彈窗放在按鈕外面：Modal 是 portal 到 body 的，但 React 的合成事件沿的是
            React 樹，寫進可點元素裡的話點蓋板關掉的那一下會再冒泡回去把它打開。 */}
        {draft && (
          <Modal
            title="編輯旅程"
            onCancel={() => setDraft(null)}
            onComplete={() => {
              updateTrip(trip.id, { ...draft, name: draft.name.trim() })
              setDraft(null)
            }}
            completeDisabled={!dirty || !tripFormValid(draft)}
            dirty={dirty}
          >
            <TripFields
              form={draft}
              onChange={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))}
              idPrefix="e"
            />
            {stranded > 0 && (
              <p style={{ fontSize: 12, color: 'var(--danger)', margin: '10px 0 0' }}>
                有 {stranded} 筆行程落在新的日期範圍外，儲存後會看不到（資料還在，把日期改回來就會出現）。
              </p>
            )}
          </Modal>
        )}

        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <span className="label">目前檢視版本</span>
          <PlanSwitcher
            trip={trip}
            plans={plans}
            activeId={activePlanId}
            onPick={onPickPlan}
          />
        </div>

        {reviewAuthors.length > 0 && (
          <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            <span className="label">心得配色</span>
            <p className="dim" style={{ fontSize: 12, margin: '0 0 8px' }}>
              只影響這台裝置看到的心得模式，不會同步給同行者。列出的是這趟寫過心得的人。
            </p>
            {reviewAuthors.map((author) => (
              <div key={author} className="review-hue-row">
                <span className="review-hue-name">{author}</span>
                <div className="review-hue-picker" role="group" aria-label={`${author}的配色`}>
                  {[undefined, ...REVIEW_HUES.map((h) => h.hue)].map((hue) => {
                    const on = (reviewHues?.[author] ?? undefined) === hue
                    return (
                      <button
                        key={hue ?? 'neutral'}
                        className="review-hue-swatch review-hue"
                        data-hue={hue}
                        data-on={on}
                        aria-pressed={on}
                        aria-label={
                          hue === undefined
                            ? `${author}用預設色`
                            : `${author}用${REVIEW_HUES[hue].label}`
                        }
                        onClick={() => setReviewHue(trip.id, author, hue)}
                      >
                        {tagCharOf(author)}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <span className="label">雲端同步</span>
          <SyncSection trip={trip} />
        </div>

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
          <ConfirmButton
            label="從本機移除"
            question={`從此裝置移除 ${itemCount} 筆行程${pendingPhotoCount ? `及 ${pendingPhotoCount} 張待上傳照片` : ''}？`}
            confirmLabel="移除"
            onConfirm={() => {
              removeTrip(trip.id)
              onLeave()
            }}
          />
        </div>
    </div>
  )
}
