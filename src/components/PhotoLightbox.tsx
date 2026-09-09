import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
  const touchStart = useRef<number | undefined>(undefined)
  const index = Math.max(0, photos.findIndex((photo) => photo.id === currentId))
  const current = photos[index]
  const localUrl = useBlobUrl(current?.fullBlob)

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
        <span>{index + 1} / {photos.length}</span>
        <button className="btn btn-sm" onClick={onClose}>關閉</button>
      </div>
      <div className="photo-lightbox-stage">
        {photos.length > 1 && <button className="photo-nav photo-nav-prev" onClick={() => move(-1)} aria-label="上一張">‹</button>}
        {src ? <img src={src} alt="行程照片" /> : <div className="photo-offline">需要網路才能檢視完整照片</div>}
        {photos.length > 1 && <button className="photo-nav photo-nav-next" onClick={() => move(1)} aria-label="下一張">›</button>}
      </div>
      <div className="photo-lightbox-actions">
        {current.status === 'failed' && onRetry && (
          <button className="btn" onClick={() => onRetry(current.id)}>重試上傳</button>
        )}
        {current.status === 'uploading' ? (
          <button className="btn" disabled>上傳中</button>
        ) : confirming ? (
          <>
            <button className="btn" onClick={() => setConfirming(false)}>取消</button>
            <button className="btn btn-danger" onClick={() => onDelete(current.id)}>確定刪除</button>
          </>
        ) : (
          <button className="btn" onClick={() => setConfirming(true)}>刪除照片</button>
        )}
      </div>
      {current.error && <div className="photo-lightbox-error">{current.error}</div>}
    </div>,
    document.body,
  )
}
