import NumberField from './NumberField'
import { dayCount } from '../lib/date'
import type { TripForm } from '../lib/tripForm'

/**
 * 新增與編輯旅程共用這組欄位。兩邊各寫一份的話，
 * 加一個欄位就得記得改兩個地方，遲早會漏。
 */
export default function TripFields({
  form,
  onChange,
  idPrefix,
}: {
  form: TripForm
  onChange: (patch: Partial<TripForm>) => void
  /** 新增與編輯可能同時掛在畫面上，欄位 id 必須各自唯一。 */
  idPrefix: string
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <label className="label" htmlFor={`${idPrefix}-name`}>旅程名稱</label>
        <input
          id={`${idPrefix}-name`}
          className="field"
          value={form.name}
          placeholder="瀨戶內海9日遊"
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor={`${idPrefix}-start`}>出發日</label>
          <input
            id={`${idPrefix}-start`}
            type="date"
            className="field"
            value={form.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor={`${idPrefix}-end`}>回程日</label>
          <input
            id={`${idPrefix}-end`}
            type="date"
            className="field"
            value={form.endDate}
            onChange={(e) => onChange({ endDate: e.target.value })}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor={`${idPrefix}-cur`}>外幣</label>
          <input
            id={`${idPrefix}-cur`}
            className="field"
            value={form.foreignCurrency}
            onChange={(e) => onChange({ foreignCurrency: e.target.value.toUpperCase() })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor={`${idPrefix}-rate`}>匯率（換台幣）</label>
          <NumberField
            id={`${idPrefix}-rate`}
            className="field mono"
            value={form.rate}
            emptyAs={0}
            onChange={(v) => onChange({ rate: v ?? 0 })}
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
    </div>
  )
}
