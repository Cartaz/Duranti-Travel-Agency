import { useCallback, useEffect, useState } from 'react'
import type { Media } from '../../domain/entities'
import {
  DAY_MEDIA_ACCEPT,
  dayMediaItineraryKey,
  MAX_DAY_MEDIA_CAPTION_LENGTH,
  type DayMediaContextOptions,
  type DayMediaMoveDirection,
} from '../../application/media/day-media-application'
import InlineConfirm from '../../ui/InlineConfirm'
import { useApplicationServices } from '../../ui/application-context'
import DayMediaLightbox from './DayMediaLightbox'
import './day-media.css'

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}

const EMPTY_CONTEXT: DayMediaContextOptions = { places: [], itineraries: [] }

export default function DayMediaGallery({
  tripId,
  dayId,
  readOnly,
}: {
  tripId: string
  dayId: string
  readOnly: boolean
}) {
  const { media: mediaApplication } = useApplicationServices()
  const [items, setItems] = useState<Media[]>([])
  const [context, setContext] = useState<DayMediaContextOptions>(EMPTY_CONTEXT)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number>()
  const [error, setError] = useState('')

  const refresh = useCallback(async (preserveError = false): Promise<void> => {
    setLoading(true)
    if (!preserveError) setError('')
    try {
      const [loadedItems, loadedContext] = await Promise.all([
        mediaApplication.listDayMedia(tripId, dayId),
        mediaApplication.listDayMediaContext(tripId, dayId),
      ])
      setItems(loadedItems)
      setContext(loadedContext)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile leggere foto e video della giornata.')
    } finally {
      setLoading(false)
    }
  }, [dayId, mediaApplication, tripId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addFiles = async (files: readonly File[]): Promise<void> => {
    if (readOnly || importing || files.length === 0) return
    setImporting(true)
    setError('')
    try {
      for (const file of files) {
        await mediaApplication.importDayMedia(tripId, dayId, file)
      }
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile aggiungere il file alla giornata.')
      await refresh(true)
    } finally {
      setImporting(false)
    }
  }

  const move = async (mediaId: string, direction: DayMediaMoveDirection): Promise<void> => {
    setError('')
    try {
      await mediaApplication.moveDayMedia(tripId, dayId, mediaId, direction)
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Impossibile riordinare i ricordi della giornata.'
      setError(message)
      throw cause instanceof Error ? cause : new Error(message)
    }
  }

  return (
    <section className="day-media" aria-labelledby="day-media-title">
      <div className="day-media-heading">
        <div>
          <p className="eyebrow">Ricordi della giornata</p>
          <h2 id="day-media-title">Foto e video</h2>
          <p>Conserva qui le immagini e i video che vuoi ritrovare insieme al racconto della giornata.</p>
        </div>
        {!readOnly && (
          <label className={`day-media-picker${importing ? ' day-media-picker-busy' : ''}`}>
            <span>{importing ? 'Importazione…' : '+ Aggiungi ricordi'}</span>
            <input
              type="file"
              accept={DAY_MEDIA_ACCEPT}
              multiple
              disabled={importing}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                void addFiles(files)
              }}
            />
          </label>
        )}
      </div>

      {error && <p className="day-media-error" role="alert">{error}</p>}
      {loading && <p className="day-media-status" role="status">Apro i ricordi della giornata…</p>}

      {!loading && items.length === 0 && (
        <div className="day-media-empty">
          <strong>Nessuna foto o video ancora.</strong>
          <span>{readOnly ? 'Questa giornata non contiene ricordi multimediali.' : 'Aggiungi una foto o un video per iniziare la galleria.'}</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="day-media-grid">
          {items.map((media, index) => (
            <DayMediaCard
              key={`${media.id}:${media.updatedAt}`}
              media={media}
              tripId={tripId}
              dayId={dayId}
              readOnly={readOnly}
              context={context}
              canMoveUp={index > 0}
              canMoveDown={index < items.length - 1}
              onOpen={() => setLightboxIndex(index)}
              onMove={(direction) => move(media.id, direction)}
              onChanged={() => refresh()}
            />
          ))}
        </div>
      )}

      {lightboxIndex !== undefined && items.length > 0 && (
        <DayMediaLightbox
          items={items}
          initialIndex={lightboxIndex}
          tripId={tripId}
          dayId={dayId}
          onClose={() => setLightboxIndex(undefined)}
        />
      )}
    </section>
  )
}

function DayMediaCard({
  media,
  tripId,
  dayId,
  readOnly,
  context,
  canMoveUp,
  canMoveDown,
  onOpen,
  onMove,
  onChanged,
}: {
  media: Media
  tripId: string
  dayId: string
  readOnly: boolean
  context: DayMediaContextOptions
  canMoveUp: boolean
  canMoveDown: boolean
  onOpen: () => void
  onMove: (direction: DayMediaMoveDirection) => Promise<void>
  onChanged: () => Promise<void>
}) {
  const { media: mediaApplication } = useApplicationServices()
  const [objectUrl, setObjectUrl] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [caption, setCaption] = useState(media.caption ?? '')
  const [placeId, setPlaceId] = useState(media.placeId ?? '')
  const [itineraryKey, setItineraryKey] = useState(dayMediaItineraryKey(media))
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const originalItineraryKey = dayMediaItineraryKey(media)
  const detailsChanged = caption.trim() !== (media.caption ?? '').trim()
    || placeId !== (media.placeId ?? '')
    || itineraryKey !== originalItineraryKey
  const placeOption = context.places.find((option) => option.id === placeId)
  const itineraryOption = context.itineraries.find((option) => option.key === itineraryKey)

  useEffect(() => {
    let cancelled = false
    let url = ''
    void mediaApplication.readDayMedia(media, tripId, dayId)
      .then((file) => {
        if (cancelled) return
        url = URL.createObjectURL(file)
        setObjectUrl(url)
      })
      .catch((cause) => {
        if (!cancelled) setPreviewError(cause instanceof Error ? cause.message : 'Anteprima non disponibile.')
      })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [dayId, media, mediaApplication, tripId])

  const saveDetails = async (): Promise<void> => {
    if (readOnly || saving || !detailsChanged) return
    setSaving(true)
    setPreviewError('')
    try {
      await mediaApplication.updateDayMediaDetails(tripId, dayId, media.id, {
        caption,
        placeId: placeId || undefined,
        itineraryKey: itineraryKey || undefined,
      })
      await onChanged()
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'Impossibile salvare i dettagli del ricordo.')
    } finally {
      setSaving(false)
    }
  }

  const move = async (direction: DayMediaMoveDirection): Promise<void> => {
    if (readOnly || saving) return
    setSaving(true)
    setPreviewError('')
    try {
      await onMove(direction)
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'Impossibile spostare il ricordo.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (readOnly || saving) return
    setSaving(true)
    setPreviewError('')
    try {
      await mediaApplication.removeDayMedia(tripId, dayId, media.id)
      setConfirmRemove(false)
      await onChanged()
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'Impossibile rimuovere il ricordo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="day-media-card">
      <div className="day-media-preview">
        {objectUrl && media.kind === 'image' && <img src={objectUrl} alt={media.caption || media.originalName || 'Foto della giornata'} />}
        {objectUrl && media.kind === 'video' && <video src={objectUrl} controls preload="metadata" />}
        {!objectUrl && !previewError && <span role="status">Carico anteprima…</span>}
        {previewError && <span className="day-media-preview-error">{previewError}</span>}
      </div>

      <div className="day-media-card-copy">
        <div className="day-media-meta">
          <strong>{media.kind === 'image' ? 'Foto' : 'Video'}</strong>
          <span>{media.originalName ?? 'File locale'} · {formatBytes(media.sizeBytes)}</span>
        </div>

        {readOnly ? (
          <>
            {media.caption && <p className="day-media-caption">{media.caption}</p>}
            {(media.placeId || originalItineraryKey) && (
              <div className="day-media-linked-summary">
                {media.placeId && <span>Luogo: {placeOption?.name ?? 'collegamento non più disponibile'}</span>}
                {originalItineraryKey && <span>Tappa: {itineraryOption?.title ?? 'collegamento non più disponibile'}</span>}
              </div>
            )}
          </>
        ) : (
          <>
            <label className="day-media-caption-editor">
              <span>Didascalia</span>
              <textarea
                rows={3}
                maxLength={MAX_DAY_MEDIA_CAPTION_LENGTH}
                value={caption}
                placeholder="Dove eravamo, cosa stavamo facendo, cosa vuoi ricordare…"
                onChange={(event) => setCaption(event.target.value)}
              />
              <small>{caption.length}/{MAX_DAY_MEDIA_CAPTION_LENGTH}</small>
            </label>

            <details className="day-media-links-editor">
              <summary>
                <span>
                  <strong>Collegamenti</strong>
                  <small>Associa questo ricordo a un luogo o a una tappa</small>
                </span>
                {(placeId || itineraryKey) && <span className="day-media-links-state">Configurati</span>}
              </summary>
              <div className="day-media-links-grid">
                <label>
                  <span>Luogo</span>
                  <select value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
                    <option value="">Nessun luogo</option>
                    {placeId && !placeOption && <option value={placeId}>Luogo non più nella giornata</option>}
                    {context.places.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Tappa</span>
                  <select value={itineraryKey} onChange={(event) => setItineraryKey(event.target.value)}>
                    <option value="">Nessuna tappa</option>
                    {itineraryKey && !itineraryOption && <option value={itineraryKey}>Tappa non più disponibile</option>}
                    {context.itineraries.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.title}{option.placeName ? ` · ${option.placeName}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
          </>
        )}

        {!confirmRemove && (
          <div className="day-media-card-actions">
            <button type="button" onClick={onOpen}>Apri</button>
            {!readOnly && (
              <>
                <button type="button" disabled={saving || !canMoveUp} aria-label="Sposta ricordo su" title="Sposta su" onClick={() => void move('up')}>↑</button>
                <button type="button" disabled={saving || !canMoveDown} aria-label="Sposta ricordo giù" title="Sposta giù" onClick={() => void move('down')}>↓</button>
                <button type="button" disabled={saving || !detailsChanged} onClick={() => void saveDetails()}>
                  {saving ? 'Aggiornamento…' : 'Salva dettagli'}
                </button>
                <button className="day-media-remove" type="button" disabled={saving} onClick={() => setConfirmRemove(true)}>
                  Rimuovi
                </button>
              </>
            )}
          </div>
        )}

        {!readOnly && confirmRemove && (
          <InlineConfirm
            title={`Rimuovere ${media.kind === 'image' ? 'questa foto' : 'questo video'}?`}
            message="Il file verrà rimosso dalla giornata e dallo spazio locale dell’app. Il testo del diario non verrà modificato."
            confirmLabel="Rimuovi ricordo"
            busy={saving}
            onCancel={() => setConfirmRemove(false)}
            onConfirm={() => void remove()}
          />
        )}
      </div>
    </article>
  )
}
