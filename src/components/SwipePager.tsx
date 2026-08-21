import { useEffect, useRef, type ReactNode } from 'react'
import { useSwipeSteps } from '../lib/useSwipeSteps'
import {
  pillGap,
  SETTLE_MS,
  setAnimating,
  setDragging,
  setPillShift,
} from '../lib/stripIndicator'

interface Props {
  /** 橫條上的每一格，順序就是左右撥的順序。只有一格時橫條不出現。 */
  items: { key: string; label: string }[]
  index: number
  onIndex: (index: number) => void
  /** 第 i 格的內容。前後各多算繪一格，撥的時候才看得到下一格跟著進來。 */
  renderPane: (index: number) => ReactNode
}

/**
 * 上面一條膠囊橫條、下面一格一頁的左右撥切換。回饋頁（換持有人）與筆記頁（換筆記）共用。
 *
 * 拖曳中動的是內容與膠囊底色，不是整個畫面 —— 整頁跟著手指跑的話，
 * 底下的導航列與頂列也會跟著位移，那不是「換一格」該有的樣子。
 * 膠囊底色往目的地那一顆滑（跟手指反向），因為它指的是「要去哪」，
 * 跟內容同向的話放開時它得倒退跨回去，看起來像做錯了。
 *
 * 行程頁不用這個：那裡的「日」是同一條長捲動裡的位置而不是一頁。
 */
export default function SwipePager({ items, index, onIndex, renderPane }: Props) {
  const stripRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const paintTrack = (dx: number, animate: boolean) => {
    const track = trackRef.current
    if (!track) return
    track.style.transition = animate ? `transform ${SETTLE_MS}ms ease-out` : ''
    track.style.transform = `translateX(calc(-33.3333% + ${dx}px))`
  }

  const swipeRef = useSwipeSteps<HTMLDivElement>({
    canPrev: index > 0,
    canNext: index < items.length - 1,
    ignoreWithin: '.daystrip',
    onShift: ({ dx, progress }) => {
      const strip = stripRef.current
      setDragging(strip, true)
      setAnimating(strip, false)
      paintTrack(dx, false)
      setPillShift(strip, pillGap(strip, index, dx < 0 ? index + 1 : index - 1) * progress)
    },
    onRelease: (step) => {
      const strip = stripRef.current
      const width = trackRef.current ? trackRef.current.offsetWidth / 3 : 0
      setAnimating(strip, true)
      paintTrack(step * -width, true)
      setPillShift(strip, step ? pillGap(strip, index, index + step) : 0)
      window.setTimeout(() => {
        /*
         * 換頁與清掉位移必須是同一刻：分兩步的話會看到底色先彈回原本那顆膠囊，
         * 下一幀才跳到新的那顆。
         */
        setAnimating(strip, false)
        setDragging(strip, false)
        setPillShift(strip, 0)
        paintTrack(0, false)
        if (step) onIndex(index + step)
      }, SETTLE_MS)
    },
  })

  // 切到畫面外的那一格時，橫條要把它帶回中間。比照日期橫條的做法。
  useEffect(() => {
    const strip = stripRef.current
    const pill = strip?.querySelectorAll<HTMLElement>('[data-strip-pill]')[index]
    if (!strip || !pill) return
    strip.scrollTo({
      left: pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2,
      behavior: 'smooth',
    })
  }, [index])

  return (
    <>
      {items.length > 1 && (
        <div className="daystrip" ref={stripRef}>
          {items.map((item, i) => (
            <button
              key={item.key}
              className="daypill"
              data-strip-pill=""
              data-on={i === index}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => onIndex(i)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="pager-view" ref={swipeRef}>
        <div className="pager-track" ref={trackRef}>
          <div className="pager-pane">{index > 0 && renderPane(index - 1)}</div>
          <div className="pager-pane">{renderPane(index)}</div>
          <div className="pager-pane">{index < items.length - 1 && renderPane(index + 1)}</div>
        </div>
      </div>
    </>
  )
}
