import { useMemo, useState } from 'react'
import { eachDay, shortDate, timeSortKey } from '../lib/date'
import { useStore } from '../store/useStore'
import type { Plan, Trip } from '../types'
import PhotoLightbox, { PhotoThumbnail, type PhotoView } from './PhotoLightbox'

export default function AlbumView({ trip, plan }: { trip: Trip; plan: Plan }) {
  const allItems = useStore((state) => state.data.items)
  const allPhotos = useStore((state) => state.data.photos)
  const pending = useStore((state) => state.pendingPhotos)
  const removePhoto = useStore((state) => state.removePhoto)
  const retryPhoto = useStore((state) => state.retryPhoto)
  const [selectedId, setSelectedId] = useState<string>()

  const { groups, views } = useMemo(() => {
    const items = allItems
      .filter((item) => item.planId === plan.id && !item.deleted)
      .sort((a, b) => a.date.localeCompare(b.date) || timeSortKey(a.startTime) - timeSortKey(b.startTime))
    const itemById = new Map(items.map((item) => [item.id, item]))
    const orderByItem = new Map(items.map((item, index) => [item.id, index]))
    const uploaded = allPhotos
      .filter((photo) => photo.tripId === trip.id && photo.kind === 'trip' && !photo.deleted && itemById.has(photo.itemId))
      .map((photo) => ({
        itemId: photo.itemId,
        view: { id: photo.id, thumbnailUrl: photo.thumbnailUrl, fullUrl: photo.fileUrl } satisfies PhotoView,
        order: photo.updatedAt,
      }))
    const queued = pending
      .filter((photo) => photo.tripId === trip.id && photo.kind === 'trip' && itemById.has(photo.itemId))
      .map((photo) => ({
        itemId: photo.itemId,
        view: {
          id: photo.id,
          thumbnailBlob: photo.thumbnailBlob,
          fullBlob: photo.fullBlob,
          status: photo.status,
          error: photo.error,
        } satisfies PhotoView,
        order: photo.updatedAt,
      }))
    const photos = [...uploaded, ...queued].sort(
      (a, b) =>
        (orderByItem.get(a.itemId) ?? 0) - (orderByItem.get(b.itemId) ?? 0) ||
        a.order - b.order ||
        a.view.id.localeCompare(b.view.id),
    )
    const byItem = new Map<string, PhotoView[]>()
    photos.forEach((photo) => byItem.set(photo.itemId, [...(byItem.get(photo.itemId) ?? []), photo.view]))
    const days = eachDay(trip.startDate, trip.endDate)
    const groups = days
      .map((date, dayIndex) => ({
        date,
        dayIndex,
        items: items
          .filter((item) => item.date === date && byItem.has(item.id))
          .map((item) => ({ item, photos: byItem.get(item.id) ?? [] })),
      }))
      .filter((group) => group.items.length)
    return { groups, views: photos.map((photo) => photo.view) }
  }, [allItems, allPhotos, pending, plan.id, trip.id, trip.startDate, trip.endDate])

  if (!groups.length) return <div className="empty">還沒有行程照片。</div>

  return (
    <div className="pane-scroll album-view">
      <div className="album-title">回憶相簿</div>
      {groups.map((group) => (
        <section key={group.date} className="album-day">
          <div className="dayhead">Day {group.dayIndex + 1} · {shortDate(group.date)}</div>
          {group.items.map(({ item, photos }) => (
            <div key={item.id} className="album-item">
              <h3>{item.startTime ? `${item.startTime} ` : ''}{item.title}</h3>
              <div className="photo-grid album-grid">
                {photos.map((photo) => (
                  <PhotoThumbnail key={photo.id} photo={photo} onClick={() => setSelectedId(photo.id)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
      {selectedId && (
        <PhotoLightbox
          photos={views}
          initialId={selectedId}
          onClose={() => setSelectedId(undefined)}
          onDelete={removePhoto}
          onRetry={retryPhoto}
        />
      )}
    </div>
  )
}
