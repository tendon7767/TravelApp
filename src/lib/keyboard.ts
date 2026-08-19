/**
 * 把 iOS 鍵盤佔掉的高度寫成 CSS 變數 `--kb`，讓版面自己讓開。
 *
 * 只做「量高度」這一件事，絕不去搬動任何 fixed 元素的位置：先前用
 * visualViewport 的 offsetTop 重新定位蓋板，iOS 只要回報殘留或還沒穩定的位移，
 * 整塊蓋板就被推出畫面、底部按鈕跟著消失。改成讓開之後，量錯的最壞情況是
 * 按鈕留在原本的底部位置，不會比什麼都不做更糟。
 *
 * 在 main.tsx 啟動時裝一次，之後不拆。掛在元件的生命週期上會出現兩個彈窗交錯時
 * 後卸載的那個把變數刪掉的競態。
 */
let installed = false

export const watchKeyboard = () => {
  if (installed) return
  const vv = window.visualViewport
  if (!vv) return
  installed = true

  const root = document.documentElement
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let resetting = false

  const apply = () => {
    // innerHeight 是版面視窗，不受鍵盤影響；visualViewport 才會被鍵盤壓小。
    // 這裡刻意不扣 offsetTop：那是 iOS 平移頁面的量，跟鍵盤多高是兩回事，
    // 扣掉會讓越下面的欄位算出越小的鍵盤高度，版面就讓得不夠。
    const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height))
    root.style.setProperty('--kb', `${keyboard}px`)
  }

  /**
   * iOS 認為焦點欄位會被鍵盤蓋住時，不會去捲該捲的容器，而是把整個版面往上平移
   * （offsetTop 變正數）。這個 App 的文件本來就不該捲動（html/body/#root 都是
   * overflow: hidden），所以任何位移都是 iOS 自己加的 —— 推回零，固定在畫面上的
   * 蓋板與底部按鈕列才不會跟著跑掉。
   */
  const unpan = () => {
    if (resetting) return
    if (vv.offsetTop === 0 && window.scrollY === 0) return
    resetting = true
    requestAnimationFrame(() => {
      window.scrollTo(0, 0)
      resetting = false
    })
  }

  /** 取消平移之後，改用捲動內層容器的方式把焦點欄位帶回可視範圍。 */
  const revealFocused = () => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return
    if (!active.matches('input, textarea, select, [contenteditable]')) return
    active.scrollIntoView({ block: 'nearest' })
  }

  const onViewportChange = () => {
    apply()
    unpan()
  }

  // iOS 的鍵盤是動畫，事件會早於最終尺寸，過一下再補算一次才收得乾淨。
  const applyLater = () => {
    onViewportChange()
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      onViewportChange()
      revealFocused()
    }, 350)
  }

  apply()
  vv.addEventListener('resize', onViewportChange)
  vv.addEventListener('scroll', onViewportChange)
  window.addEventListener('focusin', applyLater)
  window.addEventListener('focusout', applyLater)
  window.addEventListener('orientationchange', applyLater)
}
