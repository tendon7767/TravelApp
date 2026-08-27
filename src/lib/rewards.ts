import type { CostLine, Item, PaymentMethod, RewardRule, Trip } from '../types'
import { sumByCurrency } from './money'
import { timeSortKey } from './date'
import { channelKey } from './channels'

/** 把一個費用群組的金額換算成這張卡計算上限所用的幣別。 */
export const amountInMethodCurrency = (
  lines: CostLine[],
  method: PaymentMethod,
  trip: Trip,
): number => {
  let sum = 0
  for (const [cur, amt] of Object.entries(sumByCurrency(lines))) {
    if (cur === method.currency) sum += amt
    else if (cur === trip.homeCurrency) sum += amt / trip.rate
    else sum += amt * trip.rate
  }
  return sum
}

/**
 * 卡片幣別的金額換算回旅程本幣。
 * 跨卡比較一定要先過這裡 —— 有的卡用日圓算回饋、有的用台幣，直接比 ¥100 與 NT$50 會排錯。
 */
export const inHomeCurrency = (amount: number, method: PaymentMethod, trip: Trip): number =>
  method.currency === trip.homeCurrency ? amount : amount * trip.rate

/**
 * 回饋計算只看得到金額與通路 —— item / groupId 那些是給畫面用的。
 * 拆單試算會憑空造出幾筆交易，那裡沒有 item 可填，所以計算層的輸入必須比 MethodTxn 小。
 */
export interface RewardTxn {
  amount: number
  channel?: string
}

/** 一個費用群組就是一筆交易；同一行程可在這裡出現多次。 */
export interface MethodTxn extends RewardTxn {
  item: Item
  groupId: string
  groupLabel?: string
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
  txns: MethodTxn[]
  spend: number
  rules: RuleResult[]
  totalReward: number
}

/**
 * 這條規則吃不吃得到這一筆。
 * 沒設 `channels`（或空陣列）＝無條件，吃全部；設了就只吃通路相符的那幾筆。
 * 消費沒指定通路時，限定通路的規則一律吃不到 —— 寧可少算，不要憑空多算。
 */
export const ruleCovers = (rule: RewardRule, channel?: string): boolean => {
  if (!rule.channels?.length) return true
  if (!channel) return false
  const key = channelKey(channel)
  return rule.channels.some((name) => channelKey(name) === key)
}

/**
 * 每條規則各自一份交易串，不是所有規則吃同一份。
 * 混在一起算的話，在 BIC CAMERA 刷的那筆會去啃掉藥妝加碼的 `rewardCap`，總回饋直接算多，
 * 而且多得很難發現 —— 上限是慢慢被吃掉的，不會有任何一個時刻看起來不對。
 */
const amountsFor = (rule: RewardRule, txns: RewardTxn[]): number[] =>
  txns.filter((txn) => ruleCovers(rule, txn.channel)).map((txn) => txn.amount)

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

const totalRewardOf = (method: PaymentMethod, txns: RewardTxn[]): number =>
  method.rules.reduce((sum, rule) => sum + runRule(rule, amountsFor(rule, txns)).reward, 0)

export interface MarginalRule {
  rule: RewardRule
  /** 這一筆讓這條規則多算出來的回饋。額度吃緊時會小於 amount × rate。 */
  reward: number
  /** 通路對不對得上。畫面靠它區分「算出來是 0」與「這條根本沒算進去」。 */
  covered: boolean
}

export interface MarginalResult {
  /** 順序與 `method.rules` 相同。 */
  rules: MarginalRule[]
  total: number
}

/**
 * 「這一筆用這張卡刷，會多拿到多少回饋」。
 *
 * 一定要用差值算，不能用金額 × 費率：回饋上限會讓最後那一筆只拿到剩下的額度，
 * 單筆上限會把它砍掉一截。而推薦最需要準的時刻，正好就是額度快滿的時候 ——
 * 上限只剩 10 元的卡，用費率乘出來會寫著 96 元，然後被排到第一個。
 *
 * `spent` 是這張卡在這一筆之前已經刷掉的交易，**必須把要問的那一筆自己排除掉**，
 * 否則等於問「已經刷過了，再刷一次會怎樣」。
 */
export const marginalReward = (
  method: PaymentMethod,
  txn: RewardTxn,
  spent: RewardTxn[] = [],
): MarginalResult => {
  const after = [...spent, txn]
  const rules = method.rules.map<MarginalRule>((rule) => {
    const before = runRule(rule, amountsFor(rule, spent)).reward
    const total = runRule(rule, amountsFor(rule, after)).reward
    return { rule, reward: total - before, covered: ruleCovers(rule, txn.channel) }
  })
  return { rules, total: rules.reduce((sum, r) => sum + r.reward, 0) }
}

export const computeMethod = (
  method: PaymentMethod,
  items: Item[],
  trip: Trip,
): MethodResult => {
  const txns = items
    .filter((i) => !i.deleted)
    .sort((a, b) =>
      a.date === b.date
        ? timeSortKey(a.startTime) - timeSortKey(b.startTime)
        : a.date.localeCompare(b.date),
    )
    .flatMap((item) =>
      item.costGroups
        .filter((group) => group.paymentMethodId === method.id)
        .map<MethodTxn>((group) => ({
          item,
          groupId: group.id,
          groupLabel: group.label,
          channel: group.channel,
          amount: amountInMethodCurrency(
            item.costs.filter((cost) => cost.groupId === group.id),
            method,
            trip,
          ),
        })),
    )
    .filter((t) => t.amount > 0)

  const spend = txns.reduce((s, t) => s + t.amount, 0)

  const rules = method.rules.map<RuleResult>((rule) => {
    const r = runRule(rule, amountsFor(rule, txns))
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
 * `spent` 是這張卡已經刷掉的交易，一起算進去才不會在額度快滿時給出灌水的建議。
 * 回饋要跨所有規則加總 —— 一般與加碼各有自己的單筆上限，只看其中一條會低估拆單的好處。
 * 拆出來的每一筆都留在原本的通路上，否則限定通路的加碼會在試算裡憑空消失。
 */
export const suggestSplit = (
  method: PaymentMethod,
  txn: RewardTxn,
  spent: RewardTxn[] = [],
): SplitHint | null => {
  if (txn.amount <= 0) return null

  const rewardWith = (splits: number): number =>
    totalRewardOf(method, [
      ...spent,
      ...Array.from({ length: splits }, () => ({
        amount: txn.amount / splits,
        channel: txn.channel,
      })),
    ])

  const candidates = new Set<number>([1])
  for (const rule of method.rules) {
    if (!rule.perTxnRewardCap || rule.rate <= 0) continue
    // 這條規則吃不到這一筆，它的單筆上限就不構成拆單的理由。
    if (!ruleCovers(rule, txn.channel)) continue
    const sweetSpot = rule.perTxnRewardCap / rule.rate
    if (txn.amount > sweetSpot) candidates.add(Math.ceil(txn.amount / sweetSpot))
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
    each: Math.ceil(txn.amount / bestSplits),
    gain: bestReward - base,
    currency: method.currency,
  }
}
