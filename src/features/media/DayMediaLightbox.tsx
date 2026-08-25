import { useEffect, useState } from 'react'
import type { Media } from '../../domain/entities'
import { useApplicationServices } from '../../ui/application-context'

export default function DayMediaLightbox({
  items,
  initialIndex,
  tripId,
  dayId,
  onClose,
}: {
  items: Media[]
  initialIndex: number
  tripId: string
  dayId: string
  onClose: () => void
}) {
  const { media: mediaApplication } = useApplicationServices()
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(items.length - 1, 0)))
  const [objectUrl, setObjectUrl] = useState('')
  const [error, setError] = useState('')
  const media = items[index]

  const showPrevious = (): void => setIndex((current) => (current <= 0 ? items.length - 1 : current - 1))
  const showNext = (): void => setIndex((current) => (current >= items.length - 1 ? 0 : current + 1))

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (items.length <= 1) return
      if (event.key === 'ArrowLeft') setIndex((current) => (current <= 0 ? items.length - 1 : current - 1))
      if (event.key === 'ArrowRight') setIndex((current) => (current >= items.length - 1 ? 0 : current + 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items.length, onClose])

  useEffect(() => {
    if (!media) return
    let cancelled = false
    let url = ''
    setObjectUrl('')
    setError('')
    void mediaApplication.readDayMedia(media, tripId, dayId)
      .then((file) => {
        if (cancelled) return
        url = URL.createObjectURL(file)
        setObjectUrl(url)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile aprire questo ricordo.')
      })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [dayId, media, mediaApplication, tripId])

  if (!media) return null

  return (
    <div
      className="day-media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Ricordo a schermo intero"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <div className="day-media-lightbox-panel">
        <header className="day-media-lightbox-header">
          <span>{index + 1} di {items.length}</span>
          <button type="button" onClick={onClose} aria-label="Chiudi visualizzazione">Chiudi ×</button>
        </header>

        <div className="day-media-lightbox-stage">
          {!objectUrl && !error && <span role="status">Apro il ricordo…</span>}
          {error && <p role="alert">{error}</p>}
          {objectUrl && media.kind === 'image' && (
            <img src={objectUrl} alt={media.caption || media.originalName || 'Foto della giornata'} />
          )}
          {objectUrl && media.kind === 'video' && (
            <video key={media.id} src={objectUrl} controls autoPlay preload="metadata" />
          )}

          {items.length > 1 && (
            <>
              <button className="day-media-lightbox-nav day-media-lightbox-prev" type="button" onClick={showPrevious} aria-label="Ricordo precedente">‹</button>
              <button className="day-media-lightbox-nav day-media-lightbox-next" type="button" onClick={showNext} aria-label="Ricordo successivo">›</button>
            </>
          )}
        </div>

        <footer className="day-media-lightbox-footer">
          <strong>{media.kind === 'image' ? 'Foto' : 'Video'}</strong>
          {media.caption && <p>{media.caption}</p>}
          <small>{media.originalName ?? 'File locale'}</small>
        </footer>
      </div>
    </div>
  )
}
