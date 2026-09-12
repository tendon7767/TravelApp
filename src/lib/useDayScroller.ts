import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { recallViewDay, rememberViewDay } from './viewDay'

/**
 * .itinerary-scroll 與它的祖先都是 position:static，section.offsetTop 是相對 body 量的，
 * 會多算導航列與日期橫條的高度。改用兩個 rect 相減，排版怎麼變都成立。
 */
export const scrollToElement = (scroller: HTMLElement, el: HTMLElement, offset = 0, smooth = true) => {
  const top =
    scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset
  scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
}

/**
 * 日期橫條與內容捲動的連動：捲到哪一天，橫條上的哪一顆 pill 就亮起來並置中。
 * 行程列表與心得模式共用同一套 —— 這段對 sticky 與 rect 相減很敏感，複製一份必然走樣。
 *
 * 內容層要掛 scrollRef 與 scrollProps，每一天的區塊要有 data-day-section，
 * 橫條要掛 daystripRef，每顆 pill 要有 data-day-pill。
 */
/** 平滑捲動大致要跑這麼久；這段時間內不把捲動事件當成使用者手動捲。 */
const PROGRAMMATIC_MS = 450

/**
 * @param tripId 給了就會記住「這一趟這次看到第幾天」，行程列表與心得模式共用。
 *   進頁面時的落點依序是：這次看過的那一天 → 今天 → 第一天。
 */
export const useDayScroller = (days: string[], today: string, tripId?: string) => {
  const fallbackDay = days.includes(today) ? today : (days[0] ?? '')
  const [activeDay, setActiveDay] = useState(() => {
    const remembered = tripId ? recallViewDay(tripId) : undefined
    return remembered && days.includes(remembered) ? remembered : fallbackDay
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const daystripRef = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | undefined>(undefined)
  /** 為 true 表示現在的捲動是程式發動的，途中的中間值不該把 pill 搶走。 */
  const programmatic = useRef(false)

  useEffect(() => {
    setActiveDay((current) => (days.includes(current) ? current : (days.includes(today) ? today : (days[0] ?? ''))))
  }, [days, today])

  /**
   * 開頁面時捲到該停的那一天。**只做一次。**
   *
   * 以前初始值就已經是「今天」了，但掛載後那個依捲動位置回推的 effect 會立刻
   * 把它改回第一天（列表剛出現時 scrollTop 是 0），等於沒人真的捲過去 ——
   * 所以每次都得自己按一下「回到現在」。
   *
   * 停在第一天時不必捲（本來就在那裡），也避免無謂的動畫。
   */
  const landed = useRef(false)

  const updateActiveDay = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller || !days.length) return
    /*
     * 程式發動的捲動還在跑的時候不要回推。平滑捲動要好幾幀才到位，這中間
     * scrollTop 還停在原地 —— 開頁面時定位到今天，會被這裡立刻算回第一天。
     * （trackScroll 本來就先擋一次，這條是給「直接呼叫」的那幾個路徑補上的。）
     */
    if (programmatic.current) return

    let next = days[0]
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      next = days[days.length - 1]
    } else {
      const focusLine = scroller.getBoundingClientRect().top + Math.min(scroller.clientHeight * 0.22, 96)
      for (const day of days) {
        const section = scroller.querySelector<HTMLElement>(`[data-day-section="${day}"]`)
        if (!section || section.getBoundingClientRect().top > focusLine) break
        next = day
      }
    }
    setActiveDay((current) => (current === next ? current : next))
  }, [days])

  const trackScroll = useCallback(() => {
    if (programmatic.current) return
    if (scrollFrame.current !== undefined) return
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = undefined
      updateActiveDay()
    })
  }, [updateActiveDay])

  useEffect(() => {
    updateActiveDay()
    return () => {
      if (scrollFrame.current !== undefined) window.cancelAnimationFrame(scrollFrame.current)
    }
  }, [updateActiveDay])

  useEffect(() => {
    if (tripId && activeDay) rememberViewDay(tripId, activeDay)
  }, [tripId, activeDay])

  /** 橫條也一樣：第一次置中是「初始位置」不是「移動」，滑過去只是讓人等。 */
  const stripLanded = useRef(false)
  useEffect(() => {
    const strip = daystripRef.current
    // 用屬性找而不是 children[index]：前面多一顆 now 鈕時位置就全錯了。
    const pill = strip?.querySelector<HTMLElement>(`[data-day-pill="${activeDay}"]`)
    if (!strip || !pill) return
    const first = !stripLanded.current
    stripLanded.current = true
    strip.scrollTo({
      left: pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2,
      behavior: first ? 'auto' : 'smooth',
    })
  }, [activeDay, days])

  /*
   * 手指一碰就解鎖會出事：平滑捲動還在跑的時候放手指下去（連續左右撥就是這樣），
   * 鎖被清掉，途中的中間值就開始把 pill 搶走 —— 手還在螢幕上，膠囊自己在跳。
   * 所以程式捲動剛發出的那段時間內不接受解鎖，那段時間本來也不會有人想手動捲。
   */
  const lockUntil = useRef(0)
  const beginManualScroll = useCallback(() => {
    if (Date.now() < lockUntil.current) return
    programmatic.current = false
  }, [])

  /** 由程式決定要停在哪一天：先鎖住捲動追蹤，免得捲動途中的中間值把 pill 搶走。 */
  const focusDay = useCallback((day: string) => {
    programmatic.current = true
    lockUntil.current = Date.now() + PROGRAMMATIC_MS
    setActiveDay(day)
  }, [])

  /** 手勢判定成橫向之後把鎖補回去 —— 那一下的 touchstart 已經先解鎖了。 */
  const holdDay = useCallback(() => {
    programmatic.current = true
    lockUntil.current = Math.max(lockUntil.current, Date.now() + PROGRAMMATIC_MS)
  }, [])

  const jumpTo = useCallback(
    (day: string, smooth = true) => {
      const scroller = scrollRef.current
      const section = scroller?.querySelector<HTMLElement>(`[data-day-section="${day}"]`)
      focusDay(day)
      if (scroller && section) scrollToElement(scroller, section, 0, smooth)
    },
    [focusDay],
  )

  useLayoutEffect(() => {
    if (landed.current || !days.length) return
    const scroller = scrollRef.current
    if (!scroller) return
    // 內容還沒算繪出來就不算數，下一次算繪會再進來一次。
    if (!scroller.querySelector('[data-day-section]')) return
    landed.current = true
    // 開頁面那一次直接落定：那段動畫每進一次就得看一次，天數越多滑越久，
    // 而且它沒有在傳達任何東西 —— 使用者沒有「從第一天移動過來」，他本來就要看那一天。
    if (activeDay && activeDay !== days[0]) jumpTo(activeDay, false)
  }, [activeDay, days, jumpTo])

  /**
   * 捲到「現在」。今天沒有正在進行的那一筆時（沒行程，或行程全都沒填時間）
   * 退回捲到今天那一段的開頭 —— 按鈕不該因為這樣就消失。
   */
  const scrollToNow = useCallback(
    (today: string, currentItemId?: string) => {
      const scroller = scrollRef.current
      if (!scroller) return
      const section = scroller.querySelector<HTMLElement>(`[data-day-section="${today}"]`)
      const row = currentItemId
        ? scroller.querySelector<HTMLElement>(`[data-item-id="${currentItemId}"]`)
        : null
      const target = row ?? section
      if (!target) return
      focusDay(today)
      // sticky 的 .dayhead 會蓋住捲到頂端的那一列，讓開它實際量到的高度；
      // 捲到日期區塊本身時它就是頂端，不用讓。
      const head = section?.querySelector<HTMLElement>('.dayhead')
      scrollToElement(scroller, target, row ? (head?.getBoundingClientRect().height ?? 0) : 0)
    },
    [focusDay],
  )

  const scrollProps = {
    onScroll: trackScroll,
    onTouchStart: beginManualScroll,
    onWheel: beginManualScroll,
  }

  return { activeDay, scrollRef, daystripRef, scrollProps, jumpTo, focusDay, holdDay, scrollToNow }
}
