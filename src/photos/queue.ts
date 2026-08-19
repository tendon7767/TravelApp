import { del, get, set } from 'idb-keyval'
import type { Photo } from '../types'

const QUEUE_KEY = 'travelapp:photo-uploads'
export const PHOTO_THUMBNAIL_CACHE = 'travelapp-photo-thumbnails-v1'

export interface PendingPhotoUpload {
  id: string
  tripId: string
  itemId: string
  kind: Photo['kind']
  mimeType: 'image/jpeg'
  width: number
  height: number
  byteSize: number
  fullBlob: Blob
  thumbnailBlob: Blob
  updatedAt: number
  updatedBy: string
  status: 'queued' | 'uploading' | 'failed'
  error?: string
}

export const loadPendingPhotos = async (): Promise<PendingPhotoUpload[]> =>
  ((await get<PendingPhotoUpload[]>(QUEUE_KEY)) ?? []).map((upload) => ({
    ...upload,
    status: upload.status === 'uploading' ? 'queued' : upload.status,
  }))

export const savePendingPhotos = (uploads: PendingPhotoUpload[]): Promise<void> =>
  uploads.length ? set(QUEUE_KEY, uploads) : del(QUEUE_KEY)

export const cacheThumbnail = async (url: string): Promise<void> => {
  if (!('caches' in window) || !navigator.onLine) return
  try {
    const response = await fetch(url, { mode: 'no-cors' })
    const cache = await caches.open(PHOTO_THUMBNAIL_CACHE)
    await cache.put(url, response)
  } catch {
    // 縮圖快取是盡力而為；失敗不能讓照片上傳被判定失敗。
  }
}

export const removeCachedThumbnail = async (url: string): Promise<void> => {
  if (!('caches' in window) || !url) return
  try {
    await (await caches.open(PHOTO_THUMBNAIL_CACHE)).delete(url)
  } catch {
    // 清快取失敗不影響 metadata 刪除。
  }
}
