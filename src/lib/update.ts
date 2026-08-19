/**
 * 手動檢查新版本。
 *
 * service worker 設定是 autoUpdate（sw.js 裡有 skipWaiting + clientsClaim），
 * 但新版接手時，畫面上已經載入的那份 JS／CSS 不會被換掉 —— 所以自動更新實際上
 * 要冷啟動兩次才看得到。這裡把「抓新版」和「重新載入」接起來，按一下就完成。
 */
export const checkForUpdate = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator)) return false
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return false

  // 會向伺服器重新要一次 sw.js；有新版才會生出 installing／waiting。
  await reg.update()
  const next = reg.installing ?? reg.waiting
  if (!next) return false

  // 等新的 service worker 接手再重整，否則重整回來的還是舊快取。
  // 也給一個上限，萬一沒等到 controllerchange 也不要卡在這裡。
  await new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      navigator.serviceWorker.removeEventListener('controllerchange', done)
      next.removeEventListener('statechange', onState)
      resolve()
    }
    const onState = () => {
      if (next.state === 'activated' || next.state === 'redundant') done()
    }
    const timer = setTimeout(done, 8000)
    navigator.serviceWorker.addEventListener('controllerchange', done)
    next.addEventListener('statechange', onState)
  })

  return true
}
