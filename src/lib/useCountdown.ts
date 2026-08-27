import { useEffect, useState } from 'react'

const secondsLeft = (deadline?: number): number | undefined =>
  deadline === undefined ? undefined : Math.max(0, Math.ceil((deadline - Date.now()) / 1000))

/**
 * 距離某個時刻還剩幾秒，每秒更新一次；`deadline` 是 undefined 時完全不啟動計時器。
 *
 * 刻意不擴充 [useNowClock](./useNowClock.ts)：那支是每分鐘一跳，而整份行程列表都吃它，
 * 改成每秒等於讓整張表每秒重繪一次。
 *
 * 值一律由時間戳當場算出來，不是自己遞減 —— 分頁切到背景時 setInterval 會被節流甚至凍結，
 * 遞減的話回來會停在離開時的秒數，然後慢慢追。visibilitychange 再補算一次，回前景立刻是對的。
 */
export const useCountdown = (deadline?: number): number | undefined => {
  const [seconds, setSeconds] = useState(() => secondsLeft(deadline))

  useEffect(() => {
    const tick = () => setSeconds(secondsLeft(deadline))
    tick()
    if (deadline === undefined) return

    const timer = window.setInterval(tick, 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [deadline])

  return seconds
}
