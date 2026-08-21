import type { RefObject } from 'react'

interface Props {
  days: string[]
  activeDay: string
  today: string
  stripRef: RefObject<HTMLDivElement | null>
  onPick: (day: string) => void
}

/** 行程列表與心得模式共用的日期橫條。捲動連動在 useDayScroller 裡。 */
export default function DayStrip({ days, activeDay, today, stripRef, onPick }: Props) {
  return (
    <div className="daystrip" ref={stripRef}>
      {days.map((day, i) => (
        <button
          key={day}
          className="daypill"
          data-day-pill={day}
          data-strip-pill=""
          data-on={day === activeDay}
          data-today={day === today}
          onClick={() => onPick(day)}
          aria-current={day === activeDay ? 'date' : undefined}
        >
          D{i + 1}
        </button>
      ))}
    </div>
  )
}
