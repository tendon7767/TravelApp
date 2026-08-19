import { useEffect, useState } from 'react'
import { nowMinutes, todayISO } from './date'

export interface NowClock {
  /** YYYY-MM-DD */
  today: string
  /** 今天的第幾分鐘 */
  minutes: number
}

const read = (): NowClock => ({ today: todayISO(), minutes: nowMinutes() })

/**
 * 每分鐘走一次的時鐘。
 * 只有 setInterval 不夠：PWA 切到背景後計時器會被節流甚至凍結，
 * 早上放著、下午回來看到的還會是早上的高亮，所以回前景時強制重算。
 * 值沒變就回傳同一個物件，避免每分鐘白白重繪整份行程。
 */
export const useNowClock = (): NowClock => {
  const [clock, setClock] = useState<NowClock>(read)

  useEffect(() => {
    const tick = () =>
      setClock((current) => {
        const next = read()
        return current.today === next.today && current.minutes === next.minutes ? current : next
      })
    const timer = window.setInterval(tick, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  return clock
}
