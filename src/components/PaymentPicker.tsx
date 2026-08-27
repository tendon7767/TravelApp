import { useMemo, useRef, useState } from 'react'
import type { Item, PaymentMethod, Trip } from '../types'
import { useStore } from '../store/useStore'
import {
  amountInMethodCurrency,
  computeMethod,
  focusedRule,
  inHomeCurrency,
  marginalReward,
  type MarginalResult,
} from '../lib/rewards'
import { channelsOf } from '../lib/channels'
import { formatMoney } from '../lib/money'
import { OTHER_PAYMENTS, OWNERLESS } from '../lib/owners'
import Modal from './Modal'

interface Props {
  item: Item
  trip: Trip
  methods: PaymentMethod[]
  /** 正在設定哪一個費用群組。 */
  groupId: string
  isActual: boolean
  onChoose: (paymentMethodId?: string) => void
  onChooseChannel: (channel?: string) => void
  onClose: () => void
}

/**
 * 「這一筆用哪張刷」的排行榜。掛載＝打開，所以預設分區可以在 useState 的初始值裡算一次，
 * 不必寫成 effect —— effect 得把金額與卡片清單列進相依，使用者切過分區之後會被拉回預設。
 */
export default function PaymentPicker({
  item,
  trip,
  methods,
  groupId,
  isActual,
  onChoose,
  onChooseChannel,
  onClose,
}: Props) {
  const allItems = useStore((state) => state.data.items)
  const ruleFocus = useStore((state) => state.settings.rewardRuleFocus)
  const me = useStore((state) => state.settings.memberName)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [pickingChannel, setPickingChannel] = useState(false)

  const group = item.costGroups.find((row) => row.id === groupId)

  /*
   * 每張卡的三件事：這一筆改用它會多拿多少（逐條規則）、還能刷多少、回饋是不是拿滿了。
   *
   * 「多拿多少」一定要用 marginalReward 的差值算，不能拿金額 × 費率 —— 額度只剩 10 元的卡
   * 乘出來會寫著 96 元，然後被排到第一個，而那正是最需要算準的時刻。
   *
   * 算的時候排除這筆自己的花費，因為要問的是「這筆用這張刷還划算嗎」。
   * 沒有金額（剛建好消費、還沒打單價）就不模擬 —— 全是 0 的排名等於隨機。規劃版不算回饋。
   */
  const info = useMemo(() => {
    const map = new Map<
      string,
      { remaining?: number; exhausted: boolean; marginal?: MarginalResult; totalHome: number }
    >()
    if (!isActual) return map
    const withoutPickedGroup = {
      ...item,
      costGroups: item.costGroups.filter((row) => row.id !== groupId),
    }
    const others = allItems
      .filter((candidate) => candidate.planId === item.planId && !candidate.deleted)
      .map((candidate) => (candidate.id === item.id ? withoutPickedGroup : candidate))
    const lines = item.costs.filter((cost) => cost.groupId === groupId)
    for (const payment of methods) {
      const { rules, txns } = computeMethod(payment, others, trip)
      const amount = amountInMethodCurrency(lines, payment, trip)
      const marginal =
        amount > 0 ? marginalReward(payment, { amount, channel: group?.channel }, txns) : undefined
      map.set(payment.id, {
        // 跟回饋頁看到的是同一條規則，否則同一張卡在兩個畫面會給出不同的數字。
        remaining: focusedRule(rules, ruleFocus?.[payment.id])?.remainingSpend,
        // 「拿滿」只用來標示與排序，不會擋著不給選 —— 支付方式首先是記錄「實際上刷了哪張」，
        // 沒有回饋可拿不代表沒刷過它。
        exhausted: rules.length > 0 && rules.every((rule) => rule.remainingSpend === 0),
        marginal,
        // 排名與「推薦」的門檻都用本幣比，不然日圓卡與台幣卡放在一起會排錯。
        totalHome: marginal ? inHomeCurrency(marginal.total, payment, trip) : 0,
      })
    }
    return map
  }, [methods, allItems, item, trip, isActual, ruleFocus, groupId, group?.channel])

  /*
   * 依持有者分區。多人同行時常常持有同一張卡，跨持有人排名會推薦到別人的卡，
   * 所以排名與「推薦」都各區獨立。有金額時照本幣的邊際回饋排（拿滿的自然沉底），
   * 沒金額時退回名稱排序、只把拿滿的沉到最後。
   */
  const groups = useMemo(() => {
    const map = new Map<string, PaymentMethod[]>()
    for (const payment of methods) {
      const owner = payment.owner?.trim() || OWNERLESS
      map.set(owner, [...(map.get(owner) ?? []), payment])
    }
    return [...map.entries()].map(([owner, list]) => {
      const simulated = list.some((payment) => info.get(payment.id)?.marginal)
      const sorted = [...list].sort((a, b) =>
        simulated
          ? (info.get(b.id)?.totalHome ?? 0) - (info.get(a.id)?.totalHome ?? 0)
          : Number(info.get(a.id)?.exhausted ?? false) - Number(info.get(b.id)?.exhausted ?? false),
      )
      /*
       * 「推薦」只給明顯勝出的那張：差距不到 1 元（本幣）就不掛。
       * 為了三毛錢掛推薦，人會學會忽略那個標籤。全部都沒有回饋時也不掛。
       */
      const best = sorted[0]
      const bestHome = best ? (info.get(best.id)?.totalHome ?? 0) : 0
      const runnerUp = sorted[1] ? (info.get(sorted[1].id)?.totalHome ?? 0) : 0
      const recommended =
        simulated && best && bestHome > 0 && bestHome - runnerUp >= 1 ? best.id : undefined
      return [owner, sorted, recommended] as const
    })
  }, [methods, info])

  /*
   * 預設落在「看得到目前那張卡」的那一區，不然重開選單會像沒設定過。
   * 其次是自己的卡（payment.owner 與 settings.memberName 都是自由字串，對得上就用），
   * 都對不上就第一區。
   */
  const [owner, setOwner] = useState(() => {
    const ownerOf = (payment?: PaymentMethod) => payment?.owner?.trim() || OWNERLESS
    const current = methods.find((payment) => payment.id === group?.paymentMethodId)
    const mine = methods.find((payment) => ownerOf(payment) === (me.trim() || OWNERLESS))
    return ownerOf(current ?? mine ?? methods[0])
  })

  /*
   * 分區只有一個時不分區；owner 對不到任何一區（卡片被刪、持有人改名）就退回第一區，
   * 不然清單會整個空掉而畫面上沒有任何線索。
   */
  const activeOwner = groups.some(([name]) => name === owner) ? owner : groups[0]?.[0]
  const visibleGroups =
    groups.length === 1 ? groups : groups.filter(([name]) => name === activeOwner)

  /* 切區之後捲動位置留在原地的話會落在半空中，看起來像清單只有下半截。 */
  const chooseOwner = (next: string) => {
    setOwner(next)
    bodyRef.current?.closest('.sheetbody')?.scrollTo({ top: 0 })
  }

  /* 這趟的規則實際用到的通路才列出來 —— 選一個不影響任何計算的標籤沒有意義。 */
  const channels = useMemo(() => channelsOf(methods), [methods])

  return (
    <>
      <Modal title="選擇支付方式" onCancel={onClose} variant="picker">
        <div className="picker-body" ref={bodyRef}>
          {/* 一條規則都沒設過通路時整顆不出現，沒用這個功能的人畫面完全不變。 */}
          {channels.length > 0 && (
            <button className="btn btn-sm picker-channel" onClick={() => setPickingChannel(true)}>
              通路：{group?.channel || '未指定'}
            </button>
          )}
          {/* 只有一位持有人時整條切換列不出現，那是最常見的情況。 */}
          {groups.length > 1 && (
            <div className="seg picker-owners" role="group" aria-label="持有人">
              {groups.map(([name]) => (
                <button
                  key={name}
                  className="seg-btn"
                  aria-pressed={name === activeOwner}
                  onClick={() => chooseOwner(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          {visibleGroups.map(([name, list, recommended]) => (
            <div key={name} className="picker-group">
              <div className="picker-list">
                {list.map((payment) => {
                  const status = info.get(payment.id)
                  const marginal = status?.marginal
                  const uncapped = status?.remaining === undefined
                  const home =
                    marginal && payment.currency !== trip.homeCurrency
                      ? inHomeCurrency(marginal.total, payment, trip)
                      : undefined
                  return (
                    <button
                      key={payment.id}
                      className="picker-row"
                      onClick={() => onChoose(payment.id)}
                    >
                      <span className="picker-row-head">
                        <span className="picker-row-name">{payment.name || '未命名'}</span>
                        {recommended === payment.id && <span className="picker-row-tag">推薦</span>}
                        {marginal ? (
                          <span className="picker-row-total">
                            <span className="mono">
                              {formatMoney(marginal.total, payment.currency)}
                            </span>
                            {home !== undefined && (
                              <span className="picker-row-home">
                                約 {formatMoney(home, trip.homeCurrency)}
                              </span>
                            )}
                          </span>
                        ) : (
                          status && (
                            <span className="picker-row-total">
                              <span className="picker-row-label">
                                {status.exhausted ? '回饋' : '還可刷'}
                              </span>
                              <span
                                className={
                                  status.exhausted || uncapped
                                    ? 'picker-row-plain'
                                    : 'picker-row-plain mono'
                                }
                                data-bad={status.exhausted}
                              >
                                {status.exhausted
                                  ? '已拿滿'
                                  : uncapped
                                    ? '無上限'
                                    : formatMoney(status.remaining!, payment.currency)}
                              </span>
                            </span>
                          )
                        )}
                      </span>
                      {/*
                       * 逐條列出來最準：規則本來就各有名字，不必去猜哪條是「基本」哪條是「加碼」。
                       * covered 是「這條有沒有算進去」（通路對不對得上），跟「算出來是 0」不同。
                       */}
                      {marginal?.rules.map(({ rule, reward, covered }) => (
                        <span key={rule.id} className="picker-rule">
                          <span className="picker-rule-name">{rule.name}</span>
                          <span className="picker-rule-rate mono">
                            {(rule.rate * 100).toFixed(1)}%
                          </span>
                          <span className="picker-rule-value mono" data-off={!covered || undefined}>
                            {covered ? formatMoney(reward, payment.currency) : '未計入'}
                          </span>
                        </span>
                      ))}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* 現金與其他不是支付方式記錄，沒有回饋可算，所以只有名稱一行。 */}
          <div className="picker-group">
            <div className="picker-group-head">其他</div>
            <div className="picker-grid">
              <button className="picker-card" onClick={() => onChoose(undefined)}>
                <span className="picker-card-band">未設定</span>
              </button>
              {OTHER_PAYMENTS.map(([id, label]) => (
                <button key={label} className="picker-card" onClick={() => onChoose(id)}>
                  <span className="picker-card-band">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* 一筆消費就在一個通路，所以這層維持單選 picker：點一個就關，回到排行榜重算。 */}
      {pickingChannel && (
        <Modal title="這筆消費的通路" onCancel={() => setPickingChannel(false)} variant="picker">
          <div className="picker-body">
            <div className="picker-list">
              <button
                className="picker-row"
                onClick={() => {
                  onChooseChannel(undefined)
                  setPickingChannel(false)
                }}
              >
                <span className="picker-row-head">
                  <span className="picker-row-name">未指定</span>
                </span>
              </button>
              {channels.map((name) => (
                <button
                  key={name}
                  className="picker-row"
                  onClick={() => {
                    onChooseChannel(name)
                    setPickingChannel(false)
                  }}
                >
                  <span className="picker-row-head">
                    <span className="picker-row-name">{name}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
