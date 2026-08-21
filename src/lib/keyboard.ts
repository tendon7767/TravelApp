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

/*
 * 鍵盤停穩時的高度。同一台裝置、同一個方向下它是固定的，記起來就能在「還沒升起」
 * 的時候先算出版面等一下會變成多高 —— 需要讓開的人可以跟鍵盤同時開始動，
 * 而不是等它上來才捲一次。sessionStorage 是為了重新整理後第一次編輯也不必再學一次。
 */
const KB_KEY = 'travelapp:kb-height'
let expected = 0
try {
  expected = Number(sessionStorage.getItem(KB_KEY)) || 0
} catch {
  expected = 0
}

/** 上一次量到的鍵盤高度；沒量過就是 0（代表無從預測，照樣等它上來）。 */
export const expectedKeyboardHeight = (): number => expected

const remember = (px: number) => {
  // 太小的多半是動畫中間值或工具列高度變化，不是鍵盤。
  if (px < 120 || px === expected) return
  expected = px
  try {
    sessionStorage.setItem(KB_KEY, String(px))
  } catch {
    // 隱私模式寫不進去就算了，記憶體裡那份還在。
  }
}

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
    // 「鍵盤在不在」也要有旗標：CSS 沒辦法拿長度當條件，而彈窗的按鈕列
    // 要在鍵盤升起時從 sticky 改成 static（見 .sheetactions）。
    if (keyboard > 0) root.dataset.kb = 'on'
    else delete root.dataset.kb
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

  /**
   * 取消平移之後，改用捲動內層容器的方式把焦點欄位帶回可視範圍。
   * 這是全 App 的保底，只認得「焦點元素」本身 —— 自己會算的區塊（例如心得模式要連
   * 底下的按鈕一起帶進來）掛 data-self-reveal 退出，否則兩邊會各捲一次，看起來就是
   * 上推兩下。
   */
  const revealFocused = () => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return
    if (!active.matches('input, textarea, select, [contenteditable]')) return
    if (active.closest('[data-self-reveal]')) return
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
      remember(Math.max(0, Math.round(window.innerHeight - vv.height)))
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
