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
  /* 沒有鍵盤時的版面高度，用來認出「版面自己縮」那種鍵盤。寬度是它的有效期限。 */
  let layoutBaseline = window.innerHeight
  let baselineWidth = window.innerWidth

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
     * 基準線只在沒有欄位在焦點上時收，而且只往上收 —— focusout 當下鍵盤還在，`focused`
     * 卻已經是 null，直接指派會把收起途中的中間值當成基準，下一次就認不出鍵盤了。
     *
     * 只往上收的代價是轉向之後降不下來（直向的高度會被當成橫向的基準），所以拿寬度
     * 當有效期限：鍵盤不會改變寬度，改變了就是換了版面，整條重新收。用寬度而不是
     * orientationchange，是因為那個事件送達時 innerHeight 往往還是舊值。
     */
    if (window.innerWidth !== baselineWidth) {
      baselineWidth = window.innerWidth
      layoutBaseline = window.innerHeight
    }
    const focused = focusedEditable()
    if (!focused) layoutBaseline = Math.max(layoutBaseline, window.innerHeight)
    // 沒有欄位在焦點上就不算鍵盤：視窗被縮小、工具列收合都會讓版面變矮，那些不是鍵盤。
    const shrunk = focused !== null && layoutBaseline - window.innerHeight >= MIN_KEYBOARD_PX
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

  const onFocusOut = () => {
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
