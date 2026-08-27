import { useEffect, useState } from 'react'
import type { TravelBookMedia } from '../../application/travel-book/travel-book-application'
import { useApplicationServices } from '../../ui/application-context'

interface LoadedTravelBookMedia {
  media: TravelBookMedia
  url?: string
  error?: string
}

export interface TravelBookMediaGalleryProps {
  tripId: string
  dayId: string
  media: TravelBookMedia[]
}

export default function TravelBookMediaGallery({ tripId, dayId, media }: TravelBookMediaGalleryProps) {
  const { travelBook } = useApplicationServices()
  const [items, setItems] = useState<LoadedTravelBookMedia[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const createdUrls: string[] = []
    setItems([])
    if (media.length === 0) {
      setLoading(false)
      return () => undefined
    }

    setLoading(true)
    void Promise.all(media.map(async (item): Promise<LoadedTravelBookMedia | undefined> => {
      try {
        const file = await travelBook.readChapterMedia(tripId, dayId, item.id)
        const url = URL.createObjectURL(file)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return undefined
        }
        createdUrls.push(url)
        return { media: item, url }
      } catch (cause) {
        if (cancelled) return undefined
        return { media: item, error: cause instanceof Error ? cause.message : 'Media non disponibile.' }
      }
    })).then((loaded) => {
      if (!cancelled) setItems(loaded.filter((item): item is LoadedTravelBookMedia => Boolean(item)))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
      for (const url of createdUrls) URL.revokeObjectURL(url)
    }
  }, [dayId, media, travelBook, tripId])

  if (media.length === 0) return null

  return (
    <section className="travel-book-media" aria-labelledby={`travel-book-media-${dayId}`}>
      <h3 id={`travel-book-media-${dayId}`}>Ricordi della giornata</h3>
      {loading && <p className="travel-book-media-status" role="status">Carico foto e video…</p>}
      <div className="travel-book-media-grid">
        {items.map(({ media: item, url, error }) => (
          <figure className="travel-book-media-item" key={item.id}>
            {url && item.kind === 'image' && <img src={url} alt={item.caption?.trim() || item.originalName || 'Foto del viaggio'} loading="lazy" />}
            {url && item.kind === 'video' && <video src={url} controls preload="metadata" aria-label={item.caption?.trim() || item.originalName || 'Video del viaggio'} />}
            {error && <p className="travel-book-media-error" role="status">Questo media non è disponibile: {error}</p>}
            {item.caption && <figcaption>{item.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </section>
  )
}
