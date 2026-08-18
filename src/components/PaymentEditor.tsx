import { useStore } from '../store/useStore'
import type { PaymentMethod, RewardRule, Trip } from '../types'
import { newId } from '../lib/id'
import ConfirmButton from './ConfirmButton'

/**
 * 三個上限都能填，因為它們限制的東西不一樣：
 * 回饋上限管總額、消費上限管刷多少之後失效、單筆回饋上限決定要不要拆單。
 */
export default function PaymentEditor({ method, trip }: { method: PaymentMethod; trip: Trip }) {
  const updatePayment = useStore((s) => s.updatePayment)
  const removePayment = useStore((s) => s.removePayment)

  const patchRule = (ruleId: string, patch: Partial<RewardRule>) =>
    updatePayment(method.id, {
      rules: method.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    })

  const num = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v))

  return (
    <div style={{ padding: '10px 0 0' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <input
          className="field"
          style={{ flex: 2, minWidth: 140 }}
          placeholder="卡片或電子支付名稱"
          value={method.name}
          onChange={(e) => updatePayment(method.id, { name: e.target.value })}
          aria-label="名稱"
        />
        <input
          className="field"
          style={{ flex: 1, minWidth: 80 }}
          placeholder="持有人"
          value={method.owner ?? ''}
          onChange={(e) => updatePayment(method.id, { owner: e.target.value || undefined })}
          aria-label="持有人"
        />
        <select
          className="field"
          style={{ width: 92 }}
          value={method.kind}
          onChange={(e) => updatePayment(method.id, { kind: e.target.value as PaymentMethod['kind'] })}
          aria-label="種類"
        >
          <option value="card">信用卡</option>
          <option value="epay">電子支付</option>
        </select>
        <select
          className="field"
          style={{ width: 96 }}
          value={method.currency}
          onChange={(e) => updatePayment(method.id, { currency: e.target.value })}
          aria-label="上限幣別"
        >
          <option value={trip.homeCurrency}>上限 {trip.homeCurrency}</option>
          <option value={trip.foreignCurrency}>上限 {trip.foreignCurrency}</option>
        </select>
      </div>

      {method.rules.map((r) => (
        <div key={r.id} className="card" style={{ padding: 9, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              className="field"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="規則名稱"
              value={r.name}
              onChange={(e) => patchRule(r.id, { name: e.target.value })}
              aria-label="規則名稱"
            />
            <div style={{ width: 96, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                className="field mono"
                style={{ width: 62 }}
                type="number"
                step="0.1"
                value={r.rate * 100}
                onChange={(e) => patchRule(r.id, { rate: (Number(e.target.value) || 0) / 100 })}
                aria-label="回饋率"
              />
              <span className="dim">%</span>
            </div>
            {method.rules.length > 1 && (
              <button
                className="btn btn-sm"
                onClick={() => updatePayment(method.id, { rules: method.rules.filter((v) => v.id !== r.id) })}
                aria-label="刪除這條規則"
              >
                ✕
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 96 }}>
              <label className="label">回饋上限</label>
              <input
                className="field mono"
                type="number"
                placeholder="無"
                value={r.rewardCap ?? ''}
                onChange={(e) => patchRule(r.id, { rewardCap: num(e.target.value) })}
              />
            </div>
            <div style={{ flex: 1, minWidth: 96 }}>
              <label className="label">消費上限</label>
              <input
                className="field mono"
                type="number"
                placeholder="無"
                value={r.spendCap ?? ''}
                onChange={(e) => patchRule(r.id, { spendCap: num(e.target.value) })}
              />
            </div>
            <div style={{ flex: 1, minWidth: 96 }}>
              <label className="label">單筆回饋上限</label>
              <input
                className="field mono"
                type="number"
                placeholder="無"
                value={r.perTxnRewardCap ?? ''}
                onChange={(e) => patchRule(r.id, { perTxnRewardCap: num(e.target.value) })}
              />
            </div>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
        <button
          className="btn btn-sm"
          onClick={() =>
            updatePayment(method.id, {
              rules: [...method.rules, { id: newId(), name: '加碼回饋', rate: 0 }],
            })
          }
        >
          ＋ 新增回饋規則
        </button>
        <ConfirmButton
          label="刪除這張"
          question="刪除這個支付方式？"
          onConfirm={() => removePayment(method.id)}
        />
      </div>
    </div>
  )
}
