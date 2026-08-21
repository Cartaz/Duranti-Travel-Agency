import { useCallback, useEffect, useState } from 'react'
import type { Media } from '../../domain/entities'
import InlineConfirm from '../../ui/InlineConfirm'
import {
  DAY_MEDIA_ACCEPT,
  importDayMedia,
  listDayMedia,
  MAX_DAY_MEDIA_CAPTION_LENGTH,
  readDayMedia,
  removeDayMedia,
  updateDayMediaCaption,
} from './day-media-service'
import './day-media.css'

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}

export default function DayMediaGallery({
  tripId,
  dayId,
  readOnly,
}: {
  tripId: string
  dayId: string
  readOnly: boolean
}) {
  const [items, setItems] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setItems(await listDayMedia(tripId, dayId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile leggere foto e video della giornata.')
    } finally {
      setLoading(false)
    }
  }, [dayId, tripId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (readOnly || importing || !files?.length) return
    setImporting(true)
    setError('')
    try {
      for (const file of Array.from(files)) {
        await importDayMedia(tripId, dayId, file)
      }
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile aggiungere il file alla giornata.')
      await refresh()
    } finally {
      setImporting(false)
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
                const files = event.currentTarget.files
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
          {items.map((media) => (
            <DayMediaCard
              key={`${media.id}:${media.updatedAt}`}
              media={media}
              tripId={tripId}
              dayId={dayId}
              readOnly={readOnly}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function DayMediaCard({
  media,
  tripId,
  dayId,
  readOnly,
  onChanged,
}: {
  media: Media
  tripId: string
  dayId: string
  readOnly: boolean
  onChanged: () => Promise<void>
}) {
  const [objectUrl, setObjectUrl] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [caption, setCaption] = useState(media.caption ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const captionChanged = caption.trim() !== (media.caption ?? '').trim()

  useEffect(() => {
    let cancelled = false
    let url = ''
    void readDayMedia(media, tripId, dayId)
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
  }, [dayId, media, tripId])

  const saveCaption = async (): Promise<void> => {
    if (readOnly || saving || !captionChanged) return
    setSaving(true)
    setPreviewError('')
    try {
      await updateDayMediaCaption(tripId, dayId, media.id, caption)
      await onChanged()
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'Impossibile salvare la didascalia.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (readOnly || saving) return
    setSaving(true)
    setPreviewError('')
    try {
      await removeDayMedia(tripId, dayId, media.id)
      setConfirmRemove(false)
      await onChanged()
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'Impossibile rimuovere il ricordo.')
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
          media.caption && <p className="day-media-caption">{media.caption}</p>
        ) : (
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
        )}

        {!readOnly && !confirmRemove && (
          <div className="day-media-card-actions">
            <button type="button" disabled={saving || !captionChanged} onClick={() => void saveCaption()}>
              {saving ? 'Salvataggio…' : 'Salva didascalia'}
            </button>
            <button className="day-media-remove" type="button" disabled={saving} onClick={() => setConfirmRemove(true)}>
              Rimuovi
            </button>
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
