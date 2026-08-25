import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

/** 把第 from 筆搬到 to 的位置，回傳新陣列（不動原本那份）。 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = list.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

interface RowRect {
  top: number
  height: number
}

interface DragState {
  id: string
  from: number
  to: number
  dy: number
  /** 按下去那一刻量到的每列位置。拖曳途中不重量，不然自己畫的位移會回頭影響判定。 */
  rects: RowRect[]
}

/**
 * 條列項目的上下拖曳排序，握把（.drag-handle）按住才會動，整列不吃手勢 ——
 * 列裡面就是輸入框，整列可拖的話點進去打字會先被判成拖曳。
 *
 * 用 pointer 事件加 setPointerCapture：一開始就把後續的 move/up 綁在握把上，
 * 手指滑出握把（拖到別列去了本來就會滑出）也收得到。握把的 touch-action 是 none，
 * 不然瀏覽器會先把垂直手勢當成捲動整頁。
 *
 * 拖曳期間只畫位移，資料等放開才動一次：邊拖邊改資料的話，
 * 每越過一列就重繪整張表單，輸入框的焦點與 iOS 的鍵盤都會跟著閃。
 */
export function useDragSort(ids: string[], onReorder: (from: number, to: number) => void) {
  const nodes = useRef(new Map<string, HTMLElement>())
  const idsRef = useRef(ids)
  idsRef.current = ids
  const startY = useRef(0)
  const dragRef = useRef<DragState | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const write = (next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }

  const begin = (id: string) => (event: PointerEvent<HTMLElement>) => {
    const list = idsRef.current
    const from = list.indexOf(id)
    if (from < 0 || list.length < 2 || event.button > 0) return
    const rects = list.map((value) => {
      const rect = nodes.current.get(value)?.getBoundingClientRect()
      return { top: rect?.top ?? 0, height: rect?.height ?? 0 }
    })
    startY.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
    // 按住的是握把：不要順手把焦點搬走，也不要讓長按叫出選字選單。
    event.preventDefault()
    write({ id, from, to: from, dy: 0, rects })
  }

  const moveTo = (event: PointerEvent<HTMLElement>) => {
    const current = dragRef.current
    if (!current) return
    const { rects, from } = current
    const dy = event.clientY - startY.current
    const center = rects[from].top + rects[from].height / 2 + dy
    const middle = (index: number) => rects[index].top + rects[index].height / 2
    let to = from
    while (to > 0 && center < middle(to - 1)) to -= 1
    while (to < rects.length - 1 && center > middle(to + 1)) to += 1
    if (to !== current.to || dy !== current.dy) write({ ...current, to, dy })
  }

  const finish = (commit: boolean) => () => {
    const current = dragRef.current
    write(null)
    if (current && commit && current.to !== current.from) onReorder(current.from, current.to)
  }

  /** 握把也吃上下方向鍵：鍵盤與桌機沒有拖曳可用時的另一條路。 */
  const onKeyDown = (id: string) => (event: KeyboardEvent<HTMLElement>) => {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (!step) return
    const list = idsRef.current
    const index = list.indexOf(id)
    const to = index + step
    if (index < 0 || to < 0 || to >= list.length) return
    event.preventDefault()
    onReorder(index, to)
  }

  const handleProps = (id: string) => ({
    className: 'drag-handle',
    'aria-label': '拖曳排序，或用上下方向鍵移動',
    title: '拖曳排序',
    onPointerDown: begin(id),
    onPointerMove: moveTo,
    onPointerUp: finish(true),
    onPointerCancel: finish(false),
    onKeyDown: onKeyDown(id),
  })

  /**
   * 每一列要位移多少：被拖的那列跟著手指，讓位的那幾列各自搬到「隔壁那列原本的位置」。
   * 用鄰居量到的距離而不是自己的高度，列與列之間的間距才不會被吃掉。
   */
  const shiftOf = (index: number) => {
    if (!drag) return 0
    const { rects, from, to, dy } = drag
    if (index === from) return dy
    if (from < to && index > from && index <= to) return rects[index - 1].top - rects[index].top
    if (to < from && index >= to && index < from) return rects[index + 1].top - rects[index].top
    return 0
  }

  /** 第二個參數是這一列本來就有的 inline style，合併進來，呼叫端不必自己疊。 */
  const rowProps = (id: string, base?: CSSProperties) => {
    const index = ids.indexOf(id)
    const active = drag?.id === id
    const shift = shiftOf(index)
    const style: CSSProperties = {
      ...base,
      transform: shift ? `translateY(${shift}px)` : undefined,
      // 被拖的那列要黏著手指，不能有過渡；讓位的那幾列才滑過去。
      transition: drag && !active ? 'transform 0.16s ease' : 'none',
      position: active ? 'relative' : undefined,
      zIndex: active ? 2 : undefined,
    }
    return {
      ref: (node: HTMLElement | null) => {
        if (node) nodes.current.set(id, node)
        else nodes.current.delete(id)
      },
      style,
      'data-dragging': active ? 'true' : undefined,
    }
  }

  return { rowProps, handleProps, draggingId: drag?.id ?? null }
}
