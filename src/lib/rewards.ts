import type { Item, PaymentMethod, RewardRule, Trip } from '../types'
import { itemTotals } from './money'
import { timeSortKey } from './date'

/** 回饋只認真正花掉的錢；未付與尚未到期的自動結帳不預先扣額度。 */
export const SPENT_STATUSES = new Set(['已刷卡', '現場付'])

/** 把一筆項目的金額換算成這張卡計算上限所用的幣別。 */
export const amountInMethodCurrency = (item: Item, method: PaymentMethod, trip: Trip): number => {
  let sum = 0
  for (const [cur, amt] of Object.entries(itemTotals(item))) {
    if (cur === method.currency) sum += amt
    else if (cur === trip.homeCurrency) sum += amt / trip.rate
    else sum += amt * trip.rate
  }
  return sum
}

export interface RuleResult {
  rule: RewardRule
  /** 這條規則實際吃到的消費金額（受 spendCap 限制） */
  eligibleSpend: number
  reward: number
  remainingSpend?: number
  /** 有沒有撞到任何一個上限 */
  capped: boolean
}

export interface MethodResult {
  method: PaymentMethod
  txns: { item: Item; amount: number }[]
  spend: number
  rules: RuleResult[]
  totalReward: number
}

/**
 * 逐筆計算，不是總額乘費率。
 * 一筆 3,000、費率 6%、單筆回饋上限 60 的回饋是 min(180, 60) = 60，不是 180。
 * 用總額算會高估，而且高估得很難發現。
 */
/** 單一規則跑過一串交易，回傳吃到的消費、回饋、有沒有撞上限。 */
const runRule = (rule: RewardRule, amounts: number[]) => {
  let spent = 0
  let eligibleSpend = 0
  let reward = 0
  let capped = false

  for (const amount of amounts) {
    const room = rule.spendCap === undefined ? amount : Math.max(0, rule.spendCap - spent)
    const eligible = Math.min(amount, room)
    spent += amount
    if (eligible <= 0) {
      capped = true
      continue
    }

    let r = eligible * rule.rate
    if (rule.perTxnRewardCap !== undefined && r > rule.perTxnRewardCap) {
      r = rule.perTxnRewardCap
      capped = true
    }
    if (rule.rewardCap !== undefined && reward + r > rule.rewardCap) {
      r = Math.max(0, rule.rewardCap - reward)
      capped = true
    }
    eligibleSpend += eligible
    reward += r
  }

  return { spent, eligibleSpend, reward, capped }
}

const totalReward = (method: PaymentMethod, amounts: number[]): number =>
  method.rules.reduce((sum, rule) => sum + runRule(rule, amounts).reward, 0)

export const computeMethod = (
  method: PaymentMethod,
  items: Item[],
  trip: Trip,
): MethodResult => {
  const txns = items
    .filter((i) => i.paymentMethodId === method.id && !i.deleted)
    .filter((i) => i.paymentStatus && SPENT_STATUSES.has(i.paymentStatus))
    .sort((a, b) =>
      a.date === b.date
        ? timeSortKey(a.startTime) - timeSortKey(b.startTime)
        : a.date.localeCompare(b.date),
    )
    .map((item) => ({ item, amount: amountInMethodCurrency(item, method, trip) }))
    .filter((t) => t.amount > 0)

  const spend = txns.reduce((s, t) => s + t.amount, 0)

  const amounts = txns.map((t) => t.amount)
  const rules = method.rules.map<RuleResult>((rule) => {
    const r = runRule(rule, amounts)
    return {
      rule,
      eligibleSpend: r.eligibleSpend,
      reward: r.reward,
      remainingSpend: rule.spendCap === undefined ? undefined : Math.max(0, rule.spendCap - spend),
      capped: r.capped,
    }
  })

  return { method, txns, spend, rules, totalReward: rules.reduce((s, r) => s + r.reward, 0) }
}

/**
 * 單筆回饋上限會讓大額消費「浪費」回饋。
 * 回傳建議拆成幾筆、每筆多少，以及多拿多少回饋；沒有好處時回 null。
 */
export interface SplitHint {
  splits: number
  each: number
  gain: number
  currency: string
}

/**
 * `spent` 是這張卡已經刷掉的金額串，一起算進去才不會在額度快滿時給出灌水的建議。
 * 回饋要跨所有規則加總 —— 一般與加碼各有自己的單筆上限，只看其中一條會低估拆單的好處。
 */
export const suggestSplit = (
  method: PaymentMethod,
  amount: number,
  spent: number[] = [],
): SplitHint | null => {
  if (amount <= 0) return null

  const rewardWith = (splits: number): number =>
    totalReward(method, [...spent, ...Array.from({ length: splits }, () => amount / splits)])

  const candidates = new Set<number>([1])
  for (const rule of method.rules) {
    if (!rule.perTxnRewardCap || rule.rate <= 0) continue
    const sweetSpot = rule.perTxnRewardCap / rule.rate
    if (amount > sweetSpot) candidates.add(Math.ceil(amount / sweetSpot))
  }

  const base = rewardWith(1)
  let bestSplits = 1
  let bestReward = base
  for (const n of candidates) {
    const r = rewardWith(n)
    if (r > bestReward + 0.005) {
      bestSplits = n
      bestReward = r
    }
  }

  if (bestSplits <= 1) return null
  return {
    splits: bestSplits,
    each: Math.ceil(amount / bestSplits),
    gain: bestReward - base,
    currency: method.currency,
  }
}
