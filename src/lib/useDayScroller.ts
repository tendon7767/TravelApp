import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * .itinerary-scroll 與它的祖先都是 position:static，section.offsetTop 是相對 body 量的，
 * 會多算導航列與日期橫條的高度。改用兩個 rect 相減，排版怎麼變都成立。
 */
export const scrollToElement = (scroller: HTMLElement, el: HTMLElement, offset = 0) => {
  const top =
    scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset
  scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

/**
 * 日期橫條與內容捲動的連動：捲到哪一天，橫條上的哪一顆 pill 就亮起來並置中。
 * 行程列表與心得模式共用同一套 —— 這段對 sticky 與 rect 相減很敏感，複製一份必然走樣。
 *
 * 內容層要掛 scrollRef 與 scrollProps，每一天的區塊要有 data-day-section，
 * 橫條要掛 daystripRef，每顆 pill 要有 data-day-pill。
 */
export const useDayScroller = (days: string[], today: string) => {
  const [activeDay, setActiveDay] = useState(() => (days.includes(today) ? today : (days[0] ?? '')))
  const scrollRef = useRef<HTMLDivElement>(null)
  const daystripRef = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | undefined>(undefined)
  const programmaticDay = useRef<string | undefined>(undefined)

  useEffect(() => {
    setActiveDay((current) => (days.includes(current) ? current : (days.includes(today) ? today : (days[0] ?? ''))))
  }, [days, today])

  const updateActiveDay = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller || !days.length) return

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
    if (programmaticDay.current) return
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
    const strip = daystripRef.current
    // 用屬性找而不是 children[index]：前面多一顆 now 鈕時位置就全錯了。
    const pill = strip?.querySelector<HTMLElement>(`[data-day-pill="${activeDay}"]`)
    if (!strip || !pill) return
    strip.scrollTo({
      left: pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2,
      behavior: 'smooth',
    })
  }, [activeDay, days])

  const beginManualScroll = useCallback(() => {
    programmaticDay.current = undefined
  }, [])

  /** 由程式決定要停在哪一天：先鎖住捲動追蹤，免得捲動途中的中間值把 pill 搶走。 */
  const focusDay = useCallback((day: string) => {
    programmaticDay.current = day
    setActiveDay(day)
  }, [])

  const jumpTo = useCallback(
    (day: string) => {
      const scroller = scrollRef.current
      const section = scroller?.querySelector<HTMLElement>(`[data-day-section="${day}"]`)
      focusDay(day)
      if (scroller && section) scrollToElement(scroller, section)
    },
    [focusDay],
  )

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

  return { activeDay, scrollRef, daystripRef, scrollProps, jumpTo, focusDay, scrollToNow }
}
