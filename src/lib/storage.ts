/**
 * 瀏覽器預設把 IndexedDB 當成「隨時可以丟掉的快取」。這個 app 不是這樣用的 ——
 * 旅程資料、以及回得去雲端的試算表 ID 與密鑰全都存在裡面，被清掉就等於失聯。
 *
 * 各家的清除規則不同：Android Chrome 是在裝置空間不足時按 origin 淘汰，拿到
 * persistent 就完全豁免；iOS Safari 的分頁則是七天沒互動就整批清除，而且 WebKit
 * 至今沒有實作這個 API，呼叫失敗是正常的，唯一的解法是把網頁加到主畫面。
 *
 * Chrome 會依安裝狀態與互動程度自動決定要不要給，不會跳提示，所以啟動時直接問就好。
 */
export const requestPersistentStorage = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    // 已經拿到過就不必再問一次，重複呼叫在部分瀏覽器會被當成新的權限請求。
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
