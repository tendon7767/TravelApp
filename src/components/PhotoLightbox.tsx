import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CloseIcon from './CloseIcon'
import TrashIcon from './TrashIcon'

export interface PhotoView {
  id: string
  thumbnailUrl?: string
  fullUrl?: string
  thumbnailBlob?: Blob
  fullBlob?: Blob
  status?: 'queued' | 'uploading' | 'failed'
  error?: string
}

/*
 * 手勢的門檻。左右換張沿用專案既有的那組手感（見 useHorizontalSwipe），
 * 上下關閉刻意高一截：關掉是「這疊看完了」，一次瀏覽做不了幾次，
 * 誤觸的代價卻是整個檢視器消失。
 */
/** 位移超過這麼多才判定方向，避免點擊時的微小抖動被當成拖曳。 */
const LOCK_AT = 8
/** 水平要明顯多過垂直才算換張，不然想關閉的斜線會被判成換張。 */
const DIRECTION_RATIO = 1.2
/** 換張：拖過畫面寬度的四分之一，或甩得又快又遠。 */
const SWIPE_RATIO = 0.25
const FLING = 0.3
const FLING_MIN = 36
/** 關閉：拖過畫面高度的兩成，或明確往外甩一段。 */
const CLOSE_RATIO = 0.2
const CLOSE_FLING_MIN = 90
/** 放開之後補完動畫的時間，要比 CSS 的 0.22s 多一點，不然偶爾會在還差幾 px 時換內容。 */
const SETTLE_MS = 250
const MAX_SCALE = 4
/** 雙擊放大到這個倍率。再點一次回到 1。 */
const DOUBLE_TAP_SCALE = 2.5

const useBlobUrl = (blob?: Blob) => {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

export function PhotoThumbnail({ photo, onClick }: { photo: PhotoView; onClick: () => void }) {
  const localUrl = useBlobUrl(photo.thumbnailBlob)
  return (
    <button className="photo-tile" onClick={onClick} type="button">
      <img src={localUrl ?? photo.thumbnailUrl} alt="行程照片縮圖" loading="lazy" />
      {photo.status && (
        <span className={`photo-status photo-status-${photo.status}`}>
          {photo.status === 'queued' ? '待上傳' : photo.status === 'uploading' ? '上傳中' : '失敗'}
        </span>
      )}
    </button>
  )
}

/** 一格：拖曳時左右兩邊那兩張只鋪縮圖，落定之後才由 current 去載大圖。 */
function Slide({ photo, side }: { photo?: PhotoView; side: 'prev' | 'next' }) {
  const localThumb = useBlobUrl(photo?.thumbnailBlob)
  const thumb = localThumb ?? photo?.thumbnailUrl
  if (!photo) return <div className="photo-slide" data-side={side} />
  return (
    <div className="photo-slide" data-side={side}>
      {thumb && <img src={thumb} alt="" aria-hidden="true" />}
    </div>
  )
}

export default function PhotoLightbox({
  photos,
  initialId,
  onClose,
  onDelete,
  onRetry,
}: {
  photos: PhotoView[]
  initialId: string
  onClose: () => void
  onDelete: (id: string) => void
  onRetry?: (id: string) => void
}) {
  const [currentId, setCurrentId] = useState(initialId)
  const [confirming, setConfirming] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  /** 大圖的載入狀態。換一張就回到 loading，成功或失敗才離開。 */
  const [phase, setPhase] = useState<'loading' | 'shown' | 'failed'>('loading')
  /** 放大中：箭頭與說明讓開，手勢也改走平移那條。只當旗標用，實際倍率在 zoom.current。 */
  const [zoomed, setZoomed] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const index = Math.max(0, photos.findIndex((photo) => photo.id === currentId))
  const current = photos[index]
  const many = photos.length > 1
  const prevPhoto = many ? photos[(index - 1 + photos.length) % photos.length] : undefined
  const nextPhoto = many ? photos[(index + 1) % photos.length] : undefined
  const localUrl = useBlobUrl(current?.fullBlob)
  const localThumb = useBlobUrl(current?.thumbnailBlob)

  /** 目前這張的縮放與平移。放 ref 不放 state：拖曳每一幀都要寫，走 state 會整棵樹重繪。 */
  const zoom = useRef({ scale: 1, x: 0, y: 0 })
  const gesture = useRef({
    mode: 'idle' as 'idle' | 'undecided' | 'swipe' | 'close' | 'pinch' | 'pan',
    startX: 0,
    startY: 0,
    startAt: 0,
    /** 兩指起手的距離與中點，以及當下的縮放，pinch 全靠它算。 */
    pinchDist: 0,
    pinchX: 0,
    pinchY: 0,
    baseScale: 1,
    baseX: 0,
    baseY: 0,
    lastTapAt: 0,
    lastTapX: 0,
    lastTapY: 0,
  })

  const paintZoom = useCallback(() => {
    const frame = frameRef.current
    if (!frame) return
    const { scale, x, y } = zoom.current
    frame.style.transform = scale === 1 && !x && !y ? '' : `translate(${x}px, ${y}px) scale(${scale})`
  }, [])

  const resetZoom = useCallback(() => {
    zoom.current = { scale: 1, x: 0, y: 0 }
    paintZoom()
    setZoomed(false)
  }, [paintZoom])

  /** 拖曳中的位移畫在 CSS 變數上，放開才動資料。 */
  const paintDrag = useCallback((dx: number, dy: number, closing: number) => {
    const root = rootRef.current
    if (!root) return
    root.style.setProperty('--photo-dx', `${dx}px`)
    root.style.setProperty('--photo-dy', `${dy}px`)
    root.style.setProperty('--photo-fade', `${1 - closing}`)
  }, [])

  const move = useCallback(
    (delta: number) => {
      if (!photos.length) return
      const next = (index + delta + photos.length) % photos.length
      setCurrentId(photos[next].id)
      setConfirming(false)
      resetZoom()
    },
    [index, photos, resetZoom],
  )

  useEffect(() => {
    if (!photos.length) onClose()
    else if (!photos.some((photo) => photo.id === currentId)) setCurrentId(photos[Math.min(index, photos.length - 1)].id)
  }, [photos, currentId, index, onClose])

  // 換一張就回到「載入中」。<img> 那邊另外用 key 換掉整個元素，
  // 否則瀏覽器會**留著上一張**直到新圖解碼完成 —— 那正是「按了沒反應」的來源。
  useEffect(() => setPhase('loading'), [currentId])

  /*
   * 先抓好下一張。第一次切過去要等幾秒的大圖，多半在你還在看這一張的時候就下載完了。
   * 只抓單向一張：雙向等於每開一次燈箱就多兩張的流量，而人幾乎都是往同一個方向翻。
   */
  useEffect(() => {
    if (!online || !nextPhoto?.fullUrl || nextPhoto.fullBlob) return
    const img = new Image()
    img.src = nextPhoto.fullUrl
  }, [nextPhoto, online])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
    }
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('keydown', keydown)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  })

  /*
   * 手勢。掛原生監聽而不是 React 的 onTouch，因為要 `preventDefault`
   * （縮放與平移不能讓瀏覽器同時去捲頁或做橡皮筋），那需要 passive: false。
   *
   * 一套狀態機，規則只有一條：**放大中就只做平移，不換張也不關閉。**
   * 想看照片細節的時候手指一動就跳走，是最惱人的那種。
   */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const dist = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)

    /** 平移的邊界：放大之後照片超出畫面多少，就只能拖那麼多。 */
    const clampPan = () => {
      const frame = frameRef.current
      const { scale } = zoom.current
      if (!frame || scale <= 1) {
        zoom.current.x = 0
        zoom.current.y = 0
        return
      }
      const limitX = (frame.clientWidth * (scale - 1)) / 2
      const limitY = (frame.clientHeight * (scale - 1)) / 2
      zoom.current.x = Math.max(-limitX, Math.min(limitX, zoom.current.x))
      zoom.current.y = Math.max(-limitY, Math.min(limitY, zoom.current.y))
    }

    const onStart = (event: TouchEvent) => {
      const g = gesture.current
      if (event.touches.length === 2) {
        g.mode = 'pinch'
        g.pinchDist = dist(event.touches)
        g.pinchX = (event.touches[0].clientX + event.touches[1].clientX) / 2
        g.pinchY = (event.touches[0].clientY + event.touches[1].clientY) / 2
        g.baseScale = zoom.current.scale
        g.baseX = zoom.current.x
        g.baseY = zoom.current.y
        return
      }
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      g.startX = touch.clientX
      g.startY = touch.clientY
      g.startAt = event.timeStamp
      g.baseX = zoom.current.x
      g.baseY = zoom.current.y
      // 一律先當成「還沒決定」，連放大中也是：手指一落下就判成平移的話，
      // 放大之後那一下雙擊會被吃掉，就再也縮不回去了（只能靠雙指）。
      g.mode = 'undecided'
    }

    const onMove = (event: TouchEvent) => {
      const g = gesture.current
      if (g.mode === 'idle') return

      if (event.touches.length === 2 && g.mode === 'pinch') {
        event.preventDefault()
        const scale = Math.max(1, Math.min(MAX_SCALE, (g.baseScale * dist(event.touches)) / g.pinchDist))
        // 讓兩指的中點在照片上維持指著同一處：先換算成以中心為原點的座標再等比縮放。
        const frame = frameRef.current
        if (frame) {
          const box = frame.getBoundingClientRect()
          const originX = g.pinchX - (box.left + box.width / 2)
          const originY = g.pinchY - (box.top + box.height / 2)
          const ratio = scale / g.baseScale
          zoom.current.x = g.baseX + originX - originX * ratio
          zoom.current.y = g.baseY + originY - originY * ratio
        }
        zoom.current.scale = scale
        clampPan()
        paintZoom()
        return
      }

      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      const dx = touch.clientX - g.startX
      const dy = touch.clientY - g.startY

      if (g.mode === 'pan') {
        event.preventDefault()
        zoom.current.x = g.baseX + dx
        zoom.current.y = g.baseY + dy
        clampPan()
        paintZoom()
        return
      }

      if (g.mode === 'undecided') {
        if (Math.hypot(dx, dy) < LOCK_AT) return
        if (zoom.current.scale > 1) {
          // 放大中的拖曳一律是平移，不分方向 —— 換張與關閉都讓位給「看細節」。
          g.mode = 'pan'
        } else {
          const horizontal = Math.abs(dx) > Math.abs(dy) * DIRECTION_RATIO
          // 只有一張照片時橫向沒有去處，讓它當成關閉的手勢比較不會像壞掉。
          g.mode = horizontal && many ? 'swipe' : 'close'
        }
      }

      if (g.mode === 'pan') {
        event.preventDefault()
        zoom.current.x = g.baseX + dx
        zoom.current.y = g.baseY + dy
        clampPan()
        paintZoom()
        return
      }

      if (g.mode === 'swipe') {
        event.preventDefault()
        paintDrag(dx, 0, 0)
      } else if (g.mode === 'close') {
        event.preventDefault()
        // 往外拖得愈遠愈淡，放手前就看得出來「再拉一點就會關掉」。
        paintDrag(0, dy, Math.min(0.75, Math.abs(dy) / (root.clientHeight * CLOSE_RATIO * 2)))
      }
    }

    const onEnd = (event: TouchEvent) => {
      const g = gesture.current
      const mode = g.mode
      g.mode = 'idle'

      if (mode === 'pinch' || mode === 'pan') {
        if (zoom.current.scale <= 1.01) resetZoom()
        else setZoomed(true)
        return
      }

      const touch = event.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - g.startX
      const dy = touch.clientY - g.startY
      const elapsed = Math.max(1, event.timeStamp - g.startAt)

      if (mode === 'undecided') {
        // 沒有位移就是點擊：連兩下放大／還原，中間那一下由瀏覽器自己的 click 處理。
        const quick = event.timeStamp - g.lastTapAt < 300
        const samePlace = Math.hypot(touch.clientX - g.lastTapX, touch.clientY - g.lastTapY) < 24
        if (quick && samePlace) {
          g.lastTapAt = 0
          const frame = frameRef.current
          if (zoom.current.scale > 1) resetZoom()
          else if (frame) {
            const box = frame.getBoundingClientRect()
            const originX = touch.clientX - (box.left + box.width / 2)
            const originY = touch.clientY - (box.top + box.height / 2)
            zoom.current = {
              scale: DOUBLE_TAP_SCALE,
              x: originX - originX * DOUBLE_TAP_SCALE,
              y: originY - originY * DOUBLE_TAP_SCALE,
            }
            clampPan()
            paintZoom()
            setZoomed(true)
          }
          return
        }
        g.lastTapAt = event.timeStamp
        g.lastTapX = touch.clientX
        g.lastTapY = touch.clientY
        return
      }

      if (mode === 'swipe') {
        const speed = dx / elapsed
        const enough = Math.abs(dx) > root.clientWidth * SWIPE_RATIO || (Math.abs(dx) > FLING_MIN && Math.abs(speed) > FLING)
        if (enough) {
          // 先讓那一格滑到定位，再換內容 —— 位移歸零與換 id 在同一次更新裡做完，
          // 中間不會繪出「位置回到原地、內容還是舊的」那一幀。
          root.dataset.settling = 'swipe'
          root.style.setProperty('--photo-dx', `${dx > 0 ? root.clientWidth : -root.clientWidth}px`)
          window.setTimeout(() => {
            root.dataset.settling = ''
            root.style.setProperty('--photo-dx', '0px')
            move(dx > 0 ? -1 : 1)
          }, SETTLE_MS)
          return
        }
        root.dataset.settling = 'swipe'
        paintDrag(0, 0, 0)
        window.setTimeout(() => { root.dataset.settling = '' }, SETTLE_MS)
        return
      }

      if (mode === 'close') {
        const speed = dy / elapsed
        const enough = Math.abs(dy) > root.clientHeight * CLOSE_RATIO || (Math.abs(dy) > CLOSE_FLING_MIN && Math.abs(speed) > FLING)
        if (enough) {
          root.dataset.settling = 'close'
          paintDrag(0, dy > 0 ? root.clientHeight : -root.clientHeight, 1)
          window.setTimeout(onClose, SETTLE_MS)
          return
        }
        root.dataset.settling = 'close'
        paintDrag(0, 0, 0)
        window.setTimeout(() => { root.dataset.settling = '' }, SETTLE_MS)
      }
    }

    root.addEventListener('touchstart', onStart, { passive: true })
    root.addEventListener('touchmove', onMove, { passive: false })
    root.addEventListener('touchend', onEnd, { passive: true })
    root.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      root.removeEventListener('touchstart', onStart)
      root.removeEventListener('touchmove', onMove)
      root.removeEventListener('touchend', onEnd)
      root.removeEventListener('touchcancel', onEnd)
    }
  }, [many, move, onClose, paintDrag, paintZoom, resetZoom])

  if (!current) return null
  const src = localUrl ?? (online ? current.fullUrl : undefined)
  // 縮圖是 service worker 用 CacheFirst 存下來的，所以幾乎都是本機讀取、零延遲。
  // 大圖還沒到的時候先鋪它（模糊放大），畫面就不會是一片黑；滑動時左右兩張也是它撐著。
  const thumb = localThumb ?? current.thumbnailUrl
  const waiting = Boolean(src) && phase === 'loading'

  /*
   * 掛到 body，不留在詳細頁那棵樹裡。
   *
   * 詳細頁在 `.pane-detail` 上掛了兩個**原生**手勢監聽（往右拖曳關閉、捲到盡頭
   * 換上下一筆），而燈箱本來是它的後代，於是三件事同時發生：
   *   1. 往右拖曳關閉那支在 touchstart 就 `stopPropagation()`，React 的監聽掛在
   *      root container 上，因此收不到 —— 燈箱的手勢起點永遠記不到。
   *   2. 同一撥手勢反而被外層收下：拖過詳細頁寬度的四分之一，整個詳細頁直接關掉。
   *   3. 拖曳期間外層會 `translateX` 整層，而有 transform 的祖先會讓
   *      `position: fixed` 改以它為基準，燈箱跟著飄，按鈕就按不到原來的位置。
   * 移出那棵樹之後，這些監聽收不到燈箱的觸控，三件事一起消失。
   * 順帶也脫離了 `.pane-detail` 的堆疊脈絡（z-index 40），不會再被 `.ai-status`（41）蓋住。
   */
  return createPortal(
    <div className="photo-lightbox" ref={rootRef} role="dialog" aria-modal="true" aria-label="照片檢視" data-zoomed={zoomed || undefined}>
      <div className="photo-lightbox-head">
        <button className="btn btn-sm btn-glyph btn-plain" onClick={onClose} aria-label="關閉" title="關閉">
          <CloseIcon />
        </button>
        <span className="photo-count">{index + 1} / {photos.length}</span>
        {current.status === 'uploading' ? (
          <span className="photo-count photo-count-note">上傳中</span>
        ) : (
          <button
            className="btn btn-sm btn-glyph btn-plain photo-trash"
            onClick={() => setConfirming(true)}
            aria-label="刪除照片"
            title="刪除照片"
          >
            <TrashIcon size={18} />
          </button>
        )}
      </div>

      <div className="photo-lightbox-stage">
        <div className="photo-track" ref={trackRef}>
          <Slide photo={prevPhoto} side="prev" />
          <div className="photo-slide" data-side="current">
            <div className="photo-frame" ref={frameRef}>
              {thumb && phase !== 'shown' && (
                <img className="photo-lightbox-blur" src={thumb} alt="" aria-hidden="true" />
              )}
              {src ? (
                <img
                  key={current.id}
                  src={src}
                  alt="行程照片"
                  data-ready={phase === 'shown' || undefined}
                  onLoad={() => setPhase('shown')}
                  onError={() => setPhase('failed')}
                />
              ) : (
                <div className="photo-offline">需要網路才能檢視完整照片</div>
              )}
            </div>
          </div>
          <Slide photo={nextPhoto} side="next" />
        </div>

        {waiting && <div className="photo-loading">載入中…</div>}
        {phase === 'failed' && <div className="photo-loading">這張載入失敗</div>}

        {current.status === 'failed' && onRetry && (
          <div className="photo-lightbox-float">
            <button className="btn btn-sm" onClick={() => onRetry(current.id)}>重試上傳</button>
          </div>
        )}
        {confirming && (
          <div className="photo-lightbox-float photo-confirm">
            <span>刪除這張照片？</span>
            <button className="btn btn-sm" onClick={() => setConfirming(false)}>取消</button>
            <button className="btn btn-sm btn-danger" onClick={() => onDelete(current.id)}>刪除</button>
          </div>
        )}
      </div>

      {many && (
        <div className="photo-lightbox-nav">
          <button className="photo-nav" onClick={() => move(-1)} aria-label="上一張">‹</button>
          <button className="photo-nav" onClick={() => move(1)} aria-label="下一張">›</button>
        </div>
      )}
      {current.error && <div className="photo-lightbox-error">{current.error}</div>}
    </div>,
    document.body,
  )
}
