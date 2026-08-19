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

  const apply = () => {
    // innerHeight 是版面視窗，不受鍵盤影響；visualViewport 才會被鍵盤壓小。
    const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    root.style.setProperty('--kb', `${keyboard}px`)
  }

  // iOS 收鍵盤是動畫，事件會早於最終尺寸，過一下再補算一次才收得乾淨。
  const applyLater = () => {
    apply()
    clearTimeout(settleTimer)
    settleTimer = setTimeout(apply, 300)
  }

  apply()
  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
  window.addEventListener('focusin', applyLater)
  window.addEventListener('focusout', applyLater)
  window.addEventListener('orientationchange', applyLater)
}
