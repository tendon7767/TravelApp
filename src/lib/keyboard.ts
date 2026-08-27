/**
 * 全 App 唯一的軟鍵盤協調器：量 Visual Viewport、讓版面讓開，再只捲焦點欄位所在的
 * 內層容器。元件不需要知道鍵盤時序，也不各自裝 viewport listener。
 */
let installed = false

const MIN_KEYBOARD_PX = 80
const REVEAL_MARGIN_PX = 16
const REVEAL_EPSILON_PX = 3
const SETTLE_DELAY_MS = 120
const FOCUS_FALLBACK_MS = 500
const FOLLOW_TIMEOUT_MS = 1400
const STABLE_FRAMES = 6
const EDITABLE = 'input, textarea, select, [contenteditable]'
const SCROLLABLE_Y = /^(auto|scroll|overlay)$/

interface KeyboardMetrics {
  /** 被鍵盤蓋住、版面要自己讓開的那一段。版面自己縮的模式下恆為 0。 */
  height: number
  /** 鍵盤在不在。跟 height 是兩件事 —— 版面自己縮的時候鍵盤在，但不必讓開。 */
  open: boolean
  visibleTop: number
  visibleBottom: number
}

const focusedEditable = (): HTMLElement | null => {
  const active = document.activeElement
  return active instanceof HTMLElement && active.matches(EDITABLE) ? active : null
}

const scrollParentOf = (element: HTMLElement): HTMLElement | null => {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.body || parent === document.documentElement || parent.id === 'root') return null
    if (SCROLLABLE_Y.test(getComputedStyle(parent).overflowY)) return parent
  }
  return null
}

export const watchKeyboard = () => {
  if (installed) return
  const vv = window.visualViewport
  if (!vv) return
  installed = true

  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let focusFallbackTimer: ReturnType<typeof setTimeout> | undefined
  let followFrame: number | undefined
  let resetting = false
  /* 進入編輯那一刻的版面高度，用來認出「版面自己縮」那種鍵盤。0 = 沒有進行中的編輯。 */
  let preKeyboardHeight = 0

  /*
   * 鍵盤有兩種模式，`height` 只描述得了第一種：
   *
   * - **版面不縮、只有可視視窗縮**（iOS Safari 一律如此）：被蓋住那段要版面自己讓開，
   *   量就是 innerHeight 與可視視窗的差。
   * - **版面自己縮**（Android Chrome 的預設，index.html 刻意選 resizes-content）：
   *   兩者一樣高，上面那個差恆為 0 —— 而那是對的，版面已經讓開了，再讓一次會多讓一截。
   *   這種模式的訊號是 innerHeight 整個變矮，跟基準線相減才看得出來。
   *
   * 所以「鍵盤在不在」要另外回報：底部按鈕列「鍵盤升起就落底」靠的是那個旗標，
   * 不是 --kb 的值，只看 height 的話 Android 永遠不會落底。
   */
  const readMetrics = (): KeyboardMetrics => {
    // offsetTop 是 iOS 平移頁面的量，不是鍵盤高度，只有界定真正可見範圍時才使用。
    const rawHeight = Math.max(0, Math.round(window.innerHeight - vv.height))
    const height = rawHeight >= MIN_KEYBOARD_PX ? rawHeight : 0
    /*
     * 基準是「進入編輯當下量的那一次」，不是記住的最大值。
     *
     * 記住最大值的寫法只增不減，被啟動瞬間的高度污染一次（PWA 的啟動畫面、系統列還沒
     * 定位、安全區還沒套上，都可能高出 80px）就永遠回不來，症狀是鍵盤明明收起來了、
     * 只要欄位還在焦點上旗標就一直亮著，底部按鈕列因此再也不釘底。
     * 聚焦一定發生在鍵盤升起之前，所以那一刻量到的必定是沒有鍵盤的版面高度。
     */
    const shrunk = preKeyboardHeight > 0 && preKeyboardHeight - window.innerHeight >= MIN_KEYBOARD_PX
    return {
      height,
      open: height > 0 || shrunk,
      visibleTop: vv.offsetTop,
      visibleBottom: vv.offsetTop + vv.height,
    }
  }

  const apply = (): KeyboardMetrics => {
    const metrics = readMetrics()
    root.style.setProperty('--kb', `${metrics.height}px`)
    root.style.setProperty('--detail-textarea-vvh-max', `${Math.round(vv.height * 0.42)}px`)
    // CSS 不能拿長度當條件；彈窗按鈕列會用這個旗標切換 sticky 行為。
    // 看 open 不看 height —— 版面自己縮的模式下 height 是 0，但鍵盤確實在。
    if (metrics.open) root.dataset.kb = 'on'
    else delete root.dataset.kb
    return metrics
  }

  /** Safari 可能平移整份文件；文件不該捲，實際揭露一律交給內層 scroller。 */
  const unpan = () => {
    if (resetting) return
    if (vv.offsetTop === 0 && window.scrollY === 0) return
    resetting = true
    requestAnimationFrame(() => {
      window.scrollTo(0, 0)
      resetting = false
    })
  }

  const revealFocused = (metrics: KeyboardMetrics, smooth = false, withoutKeyboard = false) => {
    if (!metrics.open && !withoutKeyboard) return
    const active = focusedEditable()
    if (!active) return
    // 有附屬操作的輸入區可以宣告整組都要可見；相同的非空值會合併成同一揭露範圍。
    // 沒有標記時仍只揭露焦點欄位，空值則只揭露最近的標記容器。
    const target = active.closest<HTMLElement>('[data-keyboard-reveal]') ?? active
    const scroller = scrollParentOf(target)
    if (!scroller) return

    const box = scroller.getBoundingClientRect()
    const group = target.dataset.keyboardReveal
    const revealTargets = group
      ? Array.from(scroller.querySelectorAll<HTMLElement>('[data-keyboard-reveal]')).filter(
          (element) => element.dataset.keyboardReveal === group,
        )
      : [target]
    const rects = revealTargets.map((element) => element.getBoundingClientRect())
    const rectTop = Math.min(...rects.map((rect) => rect.top))
    const rectBottom = Math.max(...rects.map((rect) => rect.bottom))
    const top = Math.max(box.top, metrics.visibleTop) + REVEAL_MARGIN_PX
    const bottom = Math.min(box.bottom, metrics.visibleBottom) - REVEAL_MARGIN_PX
    if (bottom <= top) return

    let delta = 0
    if (rectBottom > bottom) delta = rectBottom - bottom
    else if (rectTop < top) delta = rectTop - top
    if (Math.abs(delta) < REVEAL_EPSILON_PX) return

    scroller.scrollTo({
      top: scroller.scrollTop + delta,
      behavior: smooth && !reduceMotion.matches ? 'smooth' : 'auto',
    })
  }

  const cancelFollow = () => {
    cancelAnimationFrame(followFrame ?? 0)
    followFrame = undefined
  }

  const scheduleSettle = () => {
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      const metrics = apply()
      unpan()
      revealFocused(metrics, true)
    }, SETTLE_DELAY_MS)
  }

  const startFollow = () => {
    cancelFollow()
    const startedAt = performance.now()
    let lastHeight = -1
    let stable = 0

    const step = () => {
      if (!focusedEditable()) {
        followFrame = undefined
        return
      }
      const metrics = apply()
      unpan()
      revealFocused(metrics)
      stable = metrics.height === lastHeight ? stable + 1 : 0
      lastHeight = metrics.height
      if ((metrics.open && stable >= STABLE_FRAMES) || performance.now() - startedAt >= FOLLOW_TIMEOUT_MS) {
        followFrame = undefined
        scheduleSettle()
        return
      }
      followFrame = requestAnimationFrame(step)
    }

    followFrame = requestAnimationFrame(step)
  }

  const onViewportChange = () => {
    const metrics = apply()
    unpan()
    revealFocused(metrics)
    scheduleSettle()
  }

  const onFocusIn = () => {
    if (!focusedEditable()) return
    /*
     * 只在「開始編輯」那一次量。欄位之間互跳時版面已經縮過，重新量會量到縮過的高度，
     * 差值歸零 —— 鍵盤還在螢幕上，旗標卻自己熄掉。
     */
    if (preKeyboardHeight === 0) preKeyboardHeight = window.innerHeight
    clearTimeout(focusFallbackTimer)
    if (finePointer.matches) {
      const metrics = apply()
      revealFocused(metrics, false, true)
      return
    }
    startFollow()
    focusFallbackTimer = setTimeout(() => {
      const metrics = apply()
      unpan()
      // 觸控裝置也可能接實體鍵盤；等不到軟鍵盤時仍要揭露 preventScroll 的欄位。
      revealFocused(metrics, true, true)
    }, FOCUS_FALLBACK_MS)
  }

  const onFocusOut = (event: FocusEvent) => {
    // relatedTarget 是接手焦點的那一個。還是可編輯就代表編輯還沒結束，量到的高度要留著。
    const next = event.relatedTarget
    if (!(next instanceof HTMLElement) || !next.matches(EDITABLE)) preKeyboardHeight = 0
    cancelFollow()
    clearTimeout(focusFallbackTimer)
    clearTimeout(settleTimer)
    apply()
  }

  const onEditableInput = (event: Event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches(EDITABLE)) return
    // React 先完成條件按鈕與 textarea 高度更新，下一幀再用新的整組尺寸校正。
    if (followFrame !== undefined) return
    followFrame = requestAnimationFrame(() => {
      followFrame = undefined
      revealFocused(apply())
    })
  }

  const cancelPendingReveal = () => {
    cancelFollow()
    clearTimeout(focusFallbackTimer)
    clearTimeout(settleTimer)
  }

  const onOrientationChange = () => {
    cancelPendingReveal()
    // 轉向換掉了版面高度，那一份量在舊方向的值失效；下次聚焦會重新量。
    preKeyboardHeight = 0
    apply()
    if (focusedEditable()) startFollow()
  }

  apply()
  vv.addEventListener('resize', onViewportChange)
  vv.addEventListener('scroll', onViewportChange)
  window.addEventListener('focusin', onFocusIn)
  window.addEventListener('focusout', onFocusOut)
  window.addEventListener('input', onEditableInput)
  window.addEventListener('orientationchange', onOrientationChange)
  window.addEventListener('pointerdown', cancelPendingReveal, true)
  window.addEventListener('wheel', cancelPendingReveal, true)
}
