import { useMemo, useRef, useState } from 'react'
import { processPhoto } from '../photos/process'
import { photoFullUrl, photoThumbnailUrl } from '../photos/urls'
import { useStore } from '../store/useStore'
import type { Photo, Trip } from '../types'
import PhotoLightbox, { PhotoThumbnail, type PhotoView } from './PhotoLightbox'
import PhotoIcon from './PhotoIcon'
import ReceiptIcon from './ReceiptIcon'

export default function PhotoSection({
  trip,
  itemId,
  kind,
}: {
  trip: Trip
  itemId: string
  kind: Photo['kind']
}) {
  const allPhotos = useStore((state) => state.data.photos)
  const pending = useStore((state) => state.pendingPhotos)
  const queuePhoto = useStore((state) => state.queuePhoto)
  const removePhoto = useStore((state) => state.removePhoto)
  const retryPhoto = useStore((state) => state.retryPhoto)
  const linked = useStore((state) => Boolean(state.settings.tripLinks?.[trip.id]))
  const photoApiVersion = useStore((state) => state.settings.photoApiVersion)
  const cameraRef = useRef<HTMLInputElement>(null)
  const albumRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string>()

  const views = useMemo<PhotoView[]>(() => {
    const uploaded = allPhotos
      .filter((photo) => photo.itemId === itemId && photo.kind === kind && !photo.deleted)
      .map((photo) => ({
        id: photo.id,
        thumbnailUrl: photoThumbnailUrl(photo.thumbnailFileId),
        fullUrl: photoFullUrl(photo.fileId),
        order: photo.updatedAt,
      }))
    const queued = pending
      .filter((photo) => photo.itemId === itemId && photo.kind === kind)
      .map((photo) => ({
        id: photo.id,
        thumbnailBlob: photo.thumbnailBlob,
        fullBlob: photo.fullBlob,
        status: photo.status,
        error: photo.error,
        order: photo.updatedAt,
      }))
    return [...uploaded, ...queued]
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map(({ order: _order, ...view }) => view)
  }, [allPhotos, pending, itemId, kind])

  const addFiles = async (list: FileList | null) => {
    if (!list?.length || processing) return
    setProcessing(true)
    setError('')
    const failures: string[] = []
    for (const file of Array.from(list)) {
      try {
        await queuePhoto(trip.id, itemId, await processPhoto(file, kind))
      } catch (caught) {
        failures.push(caught instanceof Error ? caught.message : String(caught))
      }
    }
    if (failures.length) setError(failures[0] + (failures.length > 1 ? `（另有 ${failures.length - 1} 張失敗）` : ''))
    setProcessing(false)
    if (cameraRef.current) cameraRef.current.value = ''
    if (albumRef.current) albumRef.current.value = ''
  }

  return (
    <section className="detail-section photo-section">
      <div className="detail-section-head">
        <span className="detail-kicker">
          {kind === 'receipt' ? <ReceiptIcon size={14} /> : <PhotoIcon size={14} />}
          {kind === 'receipt' ? '收據照片' : '行程照片'}
        </span>
      </div>

      {views.length > 0 && (
        <div className="photo-grid">
          {views.map((photo) => <PhotoThumbnail key={photo.id} photo={photo} onClick={() => setSelectedId(photo.id)} />)}
        </div>
      )}

      {!linked ? (
        <p className="dim photo-help">請先在行程設定連接雲端硬碟，才能加入照片。</p>
      ) : (photoApiVersion ?? 0) < 1 ? (
        <p className="photo-error">目前的 Apps Script 尚未支援照片，請重新部署後端。</p>
      ) : (
        <div className="photo-add-actions">
          <button className="btn btn-sm" disabled={processing} onClick={() => cameraRef.current?.click()}>
            {kind === 'receipt' ? '拍收據' : '拍照'}
          </button>
          <button className="btn btn-sm" disabled={processing} onClick={() => albumRef.current?.click()}>
            {processing ? '處理中…' : '從相簿選取'}
          </button>
          <input
            ref={cameraRef}
            className="photo-file-input"
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            onChange={(event) => void addFiles(event.target.files)}
          />
          <input
            ref={albumRef}
            className="photo-file-input"
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={(event) => void addFiles(event.target.files)}
          />
        </div>
      )}
      {error && <p className="photo-error">{error}</p>}

      {selectedId && (
        <PhotoLightbox
          photos={views}
          initialId={selectedId}
          onClose={() => setSelectedId(undefined)}
          onDelete={removePhoto}
          onRetry={retryPhoto}
        />
      )}
    </section>
  )
}
