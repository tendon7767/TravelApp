/**
 * 「這一趟現在看到第幾天」。行程列表與心得模式共用同一份，兩邊互切才會停在同一天。
 *
 * 存在 sessionStorage：這是**這一次開啟期間的瀏覽位置**，不是偏好。
 *   - 切到首頁、筆記再回來 → 同一個 session，回到剛才那一天
 *   - 關掉 App 重開 → 新的 session，回到今天（旅行中每天早上打開就是今天）
 * 所以它不進 settings、不同步 —— 同行者之間更不該互相把對方的畫面捲走。
 *
 * 記憶體那份是為了 sessionStorage 不能用的情況（無痕模式、瀏覽器擋下儲存），
 * 那時至少同一次瀏覽仍然記得住。
 */
const KEY = 'travelapp:view-day'

let memory: Record<string, string> = {}

const readAll = (): Record<string, string> => {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) return { ...memory, ...(JSON.parse(raw) as Record<string, string>) }
  } catch {
    // 無痕模式或使用者關掉儲存：用記憶體那份就好。
  }
  return memory
}

/** 這一趟上次看到哪一天。沒有記錄（或這次是冷啟動）就回 undefined。 */
export const recallViewDay = (tripId: string): string | undefined => readAll()[tripId]

export const rememberViewDay = (tripId: string, day: string): void => {
  if (!tripId || !day) return
  memory = { ...memory, [tripId]: day }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    // 寫不進去就只留記憶體那份。
  }
}
