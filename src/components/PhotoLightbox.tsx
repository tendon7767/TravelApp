import { useEffect, useRef, useState } from 'react'
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
  const touchStart = useRef<number | undefined>(undefined)
  const index = Math.max(0, photos.findIndex((photo) => photo.id === currentId))
  const current = photos[index]
  const localUrl = useBlobUrl(current?.fullBlob)
  const localThumb = useBlobUrl(current?.thumbnailBlob)

  const move = (delta: number) => {
    if (!photos.length) return
    const next = (index + delta + photos.length) % photos.length
    setCurrentId(photos[next].id)
    setConfirming(false)
  }

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
    if (!online || photos.length < 2) return
    const next = photos[(index + 1) % photos.length]
    if (!next?.fullUrl || next.fullBlob) return
    const img = new Image()
    img.src = next.fullUrl
  }, [index, photos, online])

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

  if (!current) return null
  const src = localUrl ?? (online ? current.fullUrl : undefined)
  // 縮圖是 service worker 用 CacheFirst 存下來的，所以幾乎都是本機讀取、零延遲。
  // 大圖還沒到的時候先鋪它（模糊放大），畫面就不會是一片黑。
  const thumb = localThumb ?? current.thumbnailUrl
  const waiting = Boolean(src) && phase === 'loading'

  /*
   * 掛到 body，不留在詳細頁那棵樹裡。
   *
   * 詳細頁在 `.pane-detail` 上掛了兩個**原生**手勢監聽（往右拖曳關閉、捲到盡頭
   * 換上下一筆），而燈箱本來是它的後代，於是三件事同時發生：
   *   1. 往右拖曳關閉那支在 touchstart 就 `stopPropagation()`，React 的監聽掛在
   *      root container 上，因此收不到 —— 燈箱的 `onTouchStart` 永遠沒被呼叫，
   *      記不到起點，左右滑就完全換不了照片。
   *   2. 同一撥手勢反而被外層收下：拖過詳細頁寬度的四分之一，整個詳細頁直接關掉。
   *   3. 拖曳期間外層會 `translateX` 整層，而有 transform 的祖先會讓
   *      `position: fixed` 改以它為基準，燈箱跟著飄，按鈕就按不到原來的位置。
   * 移出那棵樹之後，這些監聽收不到燈箱的觸控，三件事一起消失。
   * 順帶也脫離了 `.pane-detail` 的堆疊脈絡（z-index 40），不會再被 `.ai-status`（41）蓋住。
   */
  return createPortal(
    <div
      className="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="照片檢視"
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX }}
      onTouchEnd={(event) => {
        const start = touchStart.current
        const end = event.changedTouches[0]?.clientX
        if (start === undefined || end === undefined || Math.abs(end - start) < 45) return
        move(end < start ? 1 : -1)
      }}
    >
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

      {photos.length > 1 && (
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
