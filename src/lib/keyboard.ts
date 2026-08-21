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
  height: number
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

  const readMetrics = (): KeyboardMetrics => {
    // offsetTop 是 iOS 平移頁面的量，不是鍵盤高度，只有界定真正可見範圍時才使用。
    const rawHeight = Math.max(0, Math.round(window.innerHeight - vv.height))
    const height = rawHeight >= MIN_KEYBOARD_PX ? rawHeight : 0
    return {
      height,
      visibleTop: vv.offsetTop,
      visibleBottom: vv.offsetTop + vv.height,
    }
  }

  const apply = (): KeyboardMetrics => {
    const metrics = readMetrics()
    root.style.setProperty('--kb', `${metrics.height}px`)
    // CSS 不能拿長度當條件；彈窗按鈕列會用這個旗標切換 sticky 行為。
    if (metrics.height > 0) root.dataset.kb = 'on'
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
    if (metrics.height === 0 && !withoutKeyboard) return
    const active = focusedEditable()
    if (!active) return
    const scroller = scrollParentOf(active)
    if (!scroller) return

    const box = scroller.getBoundingClientRect()
    const rect = active.getBoundingClientRect()
    const top = Math.max(box.top, metrics.visibleTop) + REVEAL_MARGIN_PX
    const bottom = Math.min(box.bottom, metrics.visibleBottom) - REVEAL_MARGIN_PX
    if (bottom <= top) return

    let delta = 0
    if (rect.bottom > bottom) delta = rect.bottom - bottom
    else if (rect.top < top) delta = rect.top - top
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
      if ((metrics.height > 0 && stable >= STABLE_FRAMES) || performance.now() - startedAt >= FOLLOW_TIMEOUT_MS) {
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
  window.addEventListener('orientationchange', onOrientationChange)
  window.addEventListener('pointerdown', cancelPendingReveal, true)
  window.addEventListener('wheel', cancelPendingReveal, true)
}
