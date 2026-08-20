import type { Item, PaymentMethod, RewardRule, Trip } from '../types'
import { itemTotals } from './money'
import { timeSortKey } from './date'

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
  reward: number
  /** 還能刷多少才把回饋額度用完 */
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
/**
 * 「照理想筆數刷的話，刷到這個金額就把回饋領滿」。只用來在設定頁顯示參考值。
 * 不能拿來當扣減依據 —— 有單筆回饋上限時，刷出去的錢不會等比例換成回饋。
 */
/**
 * 卡片上那個「還可刷」要照哪一條規則算。
 * 預設擇優挑回饋率最高的那條 —— 要決定的通常是「這張還能不能用最好的那個%刷」；
 * 使用者在回饋頁點過某條規則的話（settings.rewardRuleFocus）就照它算。
 * 指定的規則被刪掉時 find 會落空，自動退回回饋率最高的，不會變成空白。
 * 回饋頁與選擇支付方式的選單共用這裡，兩邊的數字才不會各算各的。
 */
export const focusedRule = (rules: RuleResult[], focusId?: string): RuleResult | undefined =>
  rules.find((r) => r.rule.id === focusId) ??
  (rules.length ? rules.reduce((a, b) => (b.rule.rate > a.rule.rate ? b : a)) : undefined)

export const spendCapOf = (rule: RewardRule): number | undefined =>
  rule.rewardCap !== undefined && rule.rate > 0 ? rule.rewardCap / rule.rate : undefined

/**
 * 還可刷金額要從「回饋還剩多少沒領」回推，而不是從消費金額扣。
 * 一次刷 5,355、費率 6%、單筆上限 60：只拿到 60，回饋上限 180 還剩 120，
 * 所以還有 120 ÷ 6% = 2,000 的空間。用消費金額扣會算成 0，把還能賺的額度誤判成用完。
 */
const remainingSpendFor = (rule: RewardRule, reward: number): number | undefined =>
  rule.rewardCap !== undefined && rule.rate > 0
    ? Math.max(0, (rule.rewardCap - reward) / rule.rate)
    : undefined

/** 單一規則跑過一串交易，回傳吃到的消費、回饋、有沒有撞上限。 */
const runRule = (rule: RewardRule, amounts: number[]) => {
  let reward = 0
  let capped = false

  // 沒有另外設消費上限的閘門：回饋上限本身就會停止累積，
  // 多加一道用消費金額算的閘門反而會在單筆上限存在時提早關掉還能領的回饋。
  for (const amount of amounts) {
    let r = amount * rule.rate
    if (rule.perTxnRewardCap !== undefined && r > rule.perTxnRewardCap) {
      r = rule.perTxnRewardCap
      capped = true
    }
    if (rule.rewardCap !== undefined && reward + r > rule.rewardCap) {
      r = Math.max(0, rule.rewardCap - reward)
      capped = true
    }
    reward += r
  }

  return { reward, capped }
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
      reward: r.reward,
      remainingSpend: remainingSpendFor(rule, r.reward),
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
