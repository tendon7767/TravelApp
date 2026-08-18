import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react'

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode
}

const MAX_PULL = 52
const RETURN_MS = 320
const WHEEL_SETTLE_MS = 80

/**
 * 只移動捲動區裡的內容，外面的 header、日期列與操作列不參與回彈。
 * 瀏覽器原生 nested-scroll 橡皮筋在 iOS PWA 並不穩定，因此在邊界接管單指垂直拖曳。
 */
const ElasticScroll = forwardRef<HTMLDivElement, Props>(function ElasticScroll(
  { children, className = '', ...props },
  forwardedRef,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const returnTimer = useRef<number | undefined>(undefined)

  const assignRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef],
  )

  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return

    let tracking = false
    let edge: 'top' | 'bottom' | undefined
    let startX = 0
    let startY = 0
    let lastY = 0
    let rawPull = 0
    let wheelTimer: number | undefined

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const draw = (raw: number) => {
      const direction = Math.sign(raw)
      // 手指拖 50px 時畫面約移動 33px；上一版只有約 18px，實機上幾乎看不出來。
      const distance = MAX_PULL * (1 - Math.exp((-Math.abs(raw) * 1.05) / MAX_PULL))
      content.style.transform = `translate3d(0, ${direction * distance}px, 0)`
    }

    const clearReturn = () => {
      if (returnTimer.current !== undefined) window.clearTimeout(returnTimer.current)
      returnTimer.current = undefined
      content.style.transition = 'none'
    }

    const clearWheelTimer = () => {
      if (wheelTimer !== undefined) window.clearTimeout(wheelTimer)
      wheelTimer = undefined
    }

    const returnToRest = () => {
      if (!rawPull && !edge) {
        content.style.transform = ''
        content.style.willChange = ''
        return
      }
      rawPull = 0
      edge = undefined
      content.style.transition = reducedMotion
        ? 'none'
        : `transform ${RETURN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      content.style.transform = 'translate3d(0, 0, 0)'
      returnTimer.current = window.setTimeout(() => {
        content.style.transition = ''
        content.style.transform = ''
        content.style.willChange = ''
        returnTimer.current = undefined
      }, reducedMotion ? 0 : RETURN_MS)
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      clearWheelTimer()
      clearReturn()
      const touch = event.touches[0]
      tracking = true
      edge = undefined
      rawPull = 0
      startX = touch.clientX
      startY = touch.clientY
      lastY = touch.clientY
      content.style.transform = ''
      content.style.willChange = 'transform'
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return
      const touch = event.touches[0]
      const totalX = touch.clientX - startX
      const totalY = touch.clientY - startY
      const deltaY = touch.clientY - lastY
      lastY = touch.clientY

      // 水平拖曳交給日期列、select 等原生控制項，不誤判成垂直回彈。
      if (!edge && Math.abs(totalX) > Math.abs(totalY)) return

      if (!edge) {
        const atTop = scroller.scrollTop <= 0.5
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 0.5
        if (atTop && deltaY > 0) edge = 'top'
        else if (atBottom && deltaY < 0) edge = 'bottom'
        else return
      }

      rawPull += deltaY
      if ((edge === 'top' && rawPull <= 0) || (edge === 'bottom' && rawPull >= 0)) {
        rawPull = 0
        edge = undefined
        draw(0)
        return
      }

      // 邊界手勢由這個內容層處理，避免同一個動作再傳給鎖住的 viewport。
      event.preventDefault()
      draw(rawPull)
    }

    const onTouchEnd = () => {
      tracking = false
      returnToRest()
    }

    const onWheel = (event: WheelEvent) => {
      const atTop = scroller.scrollTop <= 0.5
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 0.5
      if ((!atTop || event.deltaY >= 0) && (!atBottom || event.deltaY <= 0)) return

      event.preventDefault()
      clearWheelTimer()
      clearReturn()
      content.style.willChange = 'transform'
      edge = atTop ? 'top' : 'bottom'

      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? scroller.clientHeight
          : 1
      const impulse = Math.max(-48, Math.min(48, -event.deltaY * unit))
      rawPull = Math.max(-120, Math.min(120, rawPull + impulse))
      draw(rawPull)
      wheelTimer = window.setTimeout(() => {
        wheelTimer = undefined
        returnToRest()
      }, WHEEL_SETTLE_MS)
    }

    scroller.addEventListener('touchstart', onTouchStart, { passive: true })
    scroller.addEventListener('touchmove', onTouchMove, { passive: false })
    scroller.addEventListener('touchend', onTouchEnd, { passive: true })
    scroller.addEventListener('touchcancel', onTouchEnd, { passive: true })
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      clearWheelTimer()
      clearReturn()
      scroller.removeEventListener('touchstart', onTouchStart)
      scroller.removeEventListener('touchmove', onTouchMove)
      scroller.removeEventListener('touchend', onTouchEnd)
      scroller.removeEventListener('touchcancel', onTouchEnd)
      scroller.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <div ref={assignRef} className={`elastic-scroll ${className}`.trim()} {...props}>
      <div ref={contentRef} className="elastic-scroll-content">
        {children}
      </div>
    </div>
  )
})

export default ElasticScroll
