import { useMemo, useState } from 'react'
import type { PaymentMethod, RewardRule, Trip } from '../types'
import { newId } from '../lib/id'
import { useStore } from '../store/useStore'
import { applyChannelRenames, channelsOf, sameChannel, sortChannels } from '../lib/channels'
import ChannelSheet from './ChannelSheet'
import ConfirmButton from './ConfirmButton'
import NumberField from './NumberField'
import { spendCapOf } from '../lib/rewards'
import { formatMoney } from '../lib/money'
import TrashIcon from './TrashIcon'

/**
 * 三個上限都能填，因為它們限制的東西不一樣：
 * 回饋上限管總額、消費上限管刷多少之後失效、單筆回饋上限決定要不要拆單。
 */
const KINDS = [
  ['card', '信用卡'],
  ['epay', '電子支付'],
] as const

export default function PaymentEditor({
  method,
  trip,
  onChange,
  onRemove,
  isNew = false,
}: {
  method: PaymentMethod
  trip: Trip
  onChange: (patch: Partial<PaymentMethod>) => void
  onRemove: () => void
  /** 新增流程還沒有東西可刪，取消就等於捨棄，不需要刪除鍵。 */
  isNew?: boolean
}) {
  const allPayments = useStore((state) => state.data.payments)
  const renameChannels = useStore((state) => state.renameChannels)
  const [editingChannels, setEditingChannels] = useState<string | null>(null)

  const patchRule = (ruleId: string, patch: Partial<RewardRule>) =>
    onChange({
      rules: method.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    })

  /*
   * 清單是「全 App 用過的通路」的聯集，跨旅程 —— 新旅程建卡時，以前打過的標籤就已經在清單裡。
   * 草稿裡剛新增、還沒存進資料的那幾個也要算進去，不然它們會在自己的清單裡消失。
   */
  const allChannels = useMemo(
    () => channelsOf([...allPayments.filter((p) => p.id !== method.id), method]),
    [allPayments, method],
  )

  /** 這個標籤除了眼前這條規則之外，還有幾條規則在用 —— 改名會動到它們，要先講。 */
  const usedElsewhere = (ruleId: string) => (name: string) =>
    [...allPayments.filter((p) => p.id !== method.id), method]
      .filter((p) => !p.deleted)
      .flatMap((p) => p.rules.map((r) => ({ payment: p.id, rule: r })))
      .filter(
        ({ payment, rule }) =>
          !(payment === method.id && rule.id === ruleId) &&
          (rule.channels ?? []).some((c) => sameChannel(c, name)),
      ).length

  /*
   * 改名是真儲存，所以除了 store 那一趟掃描，這裡的草稿也要跟著換 ——
   * 不換的話外層一按儲存就把舊名字寫回來，清單裡同時出現新舊兩個。
   *
   * 改名與新增必須在同一次 onChange 裡做完：拆成兩次的話，第二次是拿還沒套用改名的
   * method.rules 當底重算，會把第一次寫進去的新名字整批蓋回舊的，而且完全不報錯。
   */
  const saveChannels = (ruleId: string) => (renames: Map<string, string>, added: string[]) => {
    if (renames.size) renameChannels(renames)
    if (!renames.size && !added.length) return
    onChange({
      rules: method.rules.map((rule) => {
        const channels = applyChannelRenames(rule.channels, renames)
        if (rule.id !== ruleId || !added.length) return { ...rule, channels }
        // 新增即勾選 —— 沒被任何規則引用的標籤，存檔後就從清單消失了。
        return { ...rule, channels: sortChannels([...(channels ?? []), ...added]) }
      }),
    })
  }

  const channelSummary = (rule: RewardRule) => {
    const list = rule.channels ?? []
    if (!list.length) return '全部通路'
    const head = list.slice(0, 2).join('、')
    return list.length > 2 ? `限定：${head} 等 ${list.length} 個` : `限定：${head}`
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 140 }}>
          <label className="label">名稱</label>
          <input
            className="field"
            type="search"
            enterKeyHint="done"
            autoComplete="off"
            placeholder="卡片或電子支付名稱"
            value={method.name}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-label="名稱"
          />
        </div>
        <div style={{ flex: 1, minWidth: 80 }}>
          <label className="label">持有人</label>
          <input
            className="field"
            type="search"
            enterKeyHint="done"
            autoComplete="off"
            placeholder="誰的"
            value={method.owner ?? ''}
            onChange={(e) => onChange({ owner: e.target.value || undefined })}
            aria-label="持有人"
          />
        </div>
      </div>

      {/* 兩者都只有兩個選項，攤開比 <select> 快 —— 系統選單在 iOS 是整頁彈滾輪。 */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <span className="label">種類</span>
          <div className="seg" role="group" aria-label="種類">
            {KINDS.map(([value, label]) => (
              <button
                key={value}
                className="seg-btn"
                aria-pressed={method.kind === value}
                onClick={() => onChange({ kind: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">上限幣別</span>
          <div className="seg" role="group" aria-label="上限幣別">
            {[trip.homeCurrency, trip.foreignCurrency].map((code) => (
              <button
                key={code}
                className="seg-btn"
                aria-pressed={method.currency === code}
                onClick={() => onChange({ currency: code })}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </div>

      {method.rules.map((r) => (
        <div
          key={r.id}
          className="card"
          style={{ padding: 9, marginBottom: 8 }}
          data-keyboard-reveal=""
        >
          {/* 加了欄位名稱之後三者高度不同，靠底部對齊才不會參差。 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label className="label">規則名稱</label>
              <input
                className="field"
                type="search"
                enterKeyHint="done"
                autoComplete="off"
                placeholder="例如國外消費"
                value={r.name}
                onChange={(e) => patchRule(r.id, { name: e.target.value })}
                aria-label="規則名稱"
              />
            </div>
            <div style={{ width: 96 }}>
              <label className="label">回饋率</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <NumberField
                  className="field mono"
                  style={{ width: 62 }}
                  value={Math.round(r.rate * 1000) / 10}
                  emptyAs={0}
                  onChange={(v) => patchRule(r.id, { rate: (v ?? 0) / 100 })}
                  aria-label="回饋率"
                />
                <span className="dim">%</span>
              </div>
            </div>
            {method.rules.length > 1 && (
              <button
                className="btn btn-sm delete-icon-btn"
                onClick={() => onChange({ rules: method.rules.filter((v) => v.id !== r.id) })}
                aria-label="刪除這條規則"
              >
                <TrashIcon />
              </button>
            )}
          </div>
          {/*
            * 通路攤成 chip 會有兩三行，這張卡上已經有四個欄位，主體會整個變成通路。
            * 這裡只留一行摘要，清單與改名都住在彈窗裡，那裡才有空間。
            */}
          <div className="rule-channels">
            <span className="label" style={{ margin: 0 }}>適用通路</span>
            <span className="rule-channels-summary">{channelSummary(r)}</span>
            <button className="btn btn-sm" onClick={() => setEditingChannels(r.id)}>
              編輯
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 96 }}>
              <label className="label">回饋上限</label>
              <NumberField
                className="field mono"
                placeholder="無"
                value={r.rewardCap}
                onChange={(v) => patchRule(r.id, { rewardCap: v })}
                aria-label="回饋上限"
              />
            </div>
            <div style={{ flex: 1, minWidth: 96 }}>
              <label className="label">單筆回饋上限</label>
              <NumberField
                className="field mono"
                placeholder="無"
                value={r.perTxnRewardCap}
                onChange={(v) => patchRule(r.id, { perTxnRewardCap: v })}
                aria-label="單筆回饋上限"
              />
            </div>
            <div style={{ flex: 1, minWidth: 96 }}>
              <label className="label">消費上限（自動）</label>
              <div className="field mono dim" style={{ background: 'var(--surface-2)' }}>
                {spendCapOf(r) === undefined ? '無' : formatMoney(spendCapOf(r)!, method.currency)}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* 彈窗放在規則卡外面：Modal 是 portal 到 body 的，但 React 合成事件沿 React 樹跑。 */}
      {editingChannels && (
        <ChannelSheet
          selected={method.rules.find((r) => r.id === editingChannels)?.channels ?? []}
          all={allChannels}
          usedElsewhere={usedElsewhere(editingChannels)}
          onSelect={(channels) =>
            patchRule(editingChannels, { channels: channels.length ? channels : undefined })
          }
          onSave={saveChannels(editingChannels)}
          onClose={() => setEditingChannels(null)}
        />
      )}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
        <button
          className="btn btn-sm"
          onClick={() =>
            onChange({
              rules: [...method.rules, { id: newId(), name: '加碼回饋', rate: 0 }],
            })
          }
        >
          ＋ 新增回饋規則
        </button>
        {!isNew && (
          <ConfirmButton
            label="刪除這張"
            question="刪除這個支付方式？"
            onConfirm={onRemove}
          />
        )}
      </div>
    </div>
  )
}
