import { useEffect, useState, type FormEvent } from 'react'
import type { Block, Media, Place, Reservation } from '../../domain/entities'
import {
  EMPTY_RESERVATION_DRAFT,
  RESERVATION_ATTACHMENT_ACCEPT,
  type ReservationDraft,
} from '../../application/reservations/reservation-application'
import InlineConfirm from '../../ui/InlineConfirm'
import { useApplicationServices } from '../../ui/application-context'
import './reservations.css'

type MoveDirection = 'up' | 'down'
type ReservationBlockType = Extract<Block['type'], 'transport' | 'accommodation' | 'restaurant' | 'activity'>
type RemoveTarget = 'reservation' | 'attachment'

const statusLabels: Record<ReservationDraft['status'], string> = {
  planned: 'Da pianificare',
  booked: 'Prenotato',
  completed: 'Completato',
  cancelled: 'Annullato',
}

const blockConfigs: Record<ReservationBlockType, {
  label: string
  titlePlaceholder: string
  providerPlaceholder: string
  notesPlaceholder: string
  startTimeLabel: string
  endDateLabel: string
  endTimeLabel: string
}> = {
  transport: {
    label: 'Trasporto',
    titlePlaceholder: 'Volo Roma → Parigi',
    providerPlaceholder: 'Trenitalia, ITA, compagnia…',
    notesPlaceholder: 'Terminal, check-in, bagagli, dettagli utili…',
    startTimeLabel: 'Ora partenza',
    endDateLabel: 'Data arrivo',
    endTimeLabel: 'Ora arrivo',
  },
  accommodation: {
    label: 'Alloggio',
    titlePlaceholder: 'Hotel a Parigi',
    providerPlaceholder: 'Hotel, Booking, struttura…',
    notesPlaceholder: 'Check-in, colazione, camera, dettagli utili…',
    startTimeLabel: 'Ora check-in',
    endDateLabel: 'Data check-out',
    endTimeLabel: 'Ora check-out',
  },
  restaurant: {
    label: 'Ristorante',
    titlePlaceholder: 'Cena da Septime',
    providerPlaceholder: 'Ristorante, TheFork, concierge…',
    notesPlaceholder: 'Numero di coperti, richieste alimentari, tavolo, dettagli utili…',
    startTimeLabel: 'Ora inizio',
    endDateLabel: 'Data fine',
    endTimeLabel: 'Ora fine',
  },
  activity: {
    label: 'Attività',
    titlePlaceholder: 'Visita guidata al Louvre',
    providerPlaceholder: 'Museo, guida, GetYourGuide…',
    notesPlaceholder: 'Punto d’incontro, biglietti, cosa portare, dettagli utili…',
    startTimeLabel: 'Ora inizio',
    endDateLabel: 'Data fine',
    endTimeLabel: 'Ora fine',
  },
}

function reservationBlockType(block: Block): ReservationBlockType {
  if (block.type === 'transport' || block.type === 'accommodation' || block.type === 'restaurant' || block.type === 'activity') return block.type
  throw new Error('Tipo di blocco prenotazione non supportato.')
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}

function formatDayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export default function ReservationBlockEditor({
  block,
  tripId,
  dayId,
  dayDate,
  tripEndDate,
  readOnly,
  canMoveUp,
  canMoveDown,
  onChanged,
}: {
  block: Block
  tripId: string
  dayId: string
  dayDate: string
  tripEndDate?: string
  readOnly: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onChanged: () => Promise<void>
}) {
  const { planner, reservations } = useApplicationServices()
  const blockType = reservationBlockType(block)
  const config = blockConfigs[blockType]
  const [reservation, setReservation] = useState<Reservation>()
  const [attachment, setAttachment] = useState<Media>()
  const [places, setPlaces] = useState<Place[]>([])
  const [draft, setDraft] = useState<ReservationDraft>(EMPTY_RESERVATION_DRAFT)
  const [endDateInput, setEndDateInput] = useState(dayDate)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget>()
  const [error, setError] = useState('')

  const draftForDay = (value: Reservation | undefined): ReservationDraft => {
    const next = value ? reservations.reservationToDraft(value) : { ...EMPTY_RESERVATION_DRAFT }
    if (next.startsAt) next.startsAt = `${dayDate}T${next.startsAt.slice(11, 16)}`
    return next
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void Promise.all([
      reservations.getPlannerReservation(tripId, dayId, block.id),
      reservations.listSavedPlaces(),
    ])
      .then(async ([loadedReservation, loadedPlaces]) => {
        const loadedAttachment = loadedReservation
          ? await reservations.getPlannerReservationAttachment(tripId, dayId, block.id, loadedReservation)
          : undefined
        if (cancelled) return
        const loadedDraft = draftForDay(loadedReservation)
        setReservation(loadedReservation)
        setAttachment(loadedAttachment)
        setPlaces(loadedPlaces)
        setDraft(loadedDraft)
        setEndDateInput(loadedDraft.endsAt?.slice(0, 10) ?? dayDate)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere la prenotazione.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [block.id, block.updatedAt, dayDate, dayId, reservations, tripId])

  const patch = (changes: Partial<ReservationDraft>): void => setDraft((current) => ({ ...current, ...changes }))
  const busy = saving || attachmentBusy
  const startTime = draft.startsAt?.slice(11, 16) ?? ''
  const endTime = draft.endsAt?.slice(11, 16) ?? ''
  const sameDayEnd = endDateInput === dayDate

  const updateStartTime = (value: string): void => {
    setError('')
    setDraft((current) => {
      const startsAt = value ? `${dayDate}T${value}` : undefined
      const endsAt = current.endsAt && startsAt && current.endsAt >= startsAt ? current.endsAt : undefined
      return { ...current, startsAt, endsAt }
    })
    if (!value) setEndDateInput(dayDate)
  }

  const updateEndDate = (value: string): void => {
    const nextDate = value || dayDate
    setError('')
    setEndDateInput(nextDate)
    setDraft((current) => {
      const currentEndTime = current.endsAt?.slice(11, 16)
      if (!currentEndTime) return current
      const nextEnd = `${nextDate}T${currentEndTime}`
      return { ...current, endsAt: current.startsAt && nextEnd >= current.startsAt ? nextEnd : undefined }
    })
  }

  const updateEndTime = (value: string): void => {
    setError('')
    patch({ endsAt: value ? `${endDateInput}T${value}` : undefined })
  }

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (readOnly || busy) return
    setSaving(true)
    setError('')
    try {
      const saved = await reservations.savePlannerReservation(tripId, dayId, block.id, draft)
      const savedDraft = draftForDay(saved)
      setReservation(saved)
      setDraft(savedDraft)
      setEndDateInput(savedDraft.endsAt?.slice(0, 10) ?? dayDate)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare la prenotazione.')
    } finally {
      setSaving(false)
    }
  }

  const uploadAttachment = async (file: File): Promise<void> => {
    if (readOnly || busy) return
    setAttachmentBusy(true)
    setError('')
    try {
      const result = await reservations.attachPlannerReservationFile(tripId, dayId, block.id, file)
      setReservation(result.reservation)
      setAttachment(result.media)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare l’allegato.')
    } finally {
      setAttachmentBusy(false)
    }
  }

  const removeAttachment = async (): Promise<void> => {
    if (readOnly || busy || !attachment) return
    setAttachmentBusy(true)
    setError('')
    try {
      const updated = await reservations.removePlannerReservationAttachment(tripId, dayId, block.id)
      setReservation(updated)
      setAttachment(undefined)
      setRemoveTarget(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile rimuovere l’allegato.')
    } finally {
      setAttachmentBusy(false)
    }
  }

  const openAttachment = async (): Promise<void> => {
    if (!attachment || attachmentBusy) return
    setAttachmentBusy(true)
    setError('')
    try {
      const file = await reservations.readPlannerReservationAttachment(attachment)
      const objectUrl = URL.createObjectURL(file)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile aprire l’allegato.')
    } finally {
      setAttachmentBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (readOnly || busy) return
    setSaving(true)
    setError('')
    try {
      await reservations.deletePlannerReservationBlock(tripId, dayId, block.id)
      setRemoveTarget(undefined)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile eliminare la prenotazione.')
      setSaving(false)
    }
  }

  const move = async (direction: MoveDirection): Promise<void> => {
    if (readOnly || busy) return
    setSaving(true)
    setError('')
    try {
      await planner.movePlannerBlock(tripId, dayId, block.id, direction)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile spostare la prenotazione.')
    } finally {
      setSaving(false)
    }
  }

  const hasOptionalDetails = Boolean(
    draft.provider?.trim() || draft.confirmationCode?.trim() || draft.timezone?.trim() || draft.url?.trim() || draft.notes?.trim(),
  )

  return (
    <form className={`planner-block reservation-block reservation-block-${blockType}`} onSubmit={(event) => void save(event)}>
      <div className="planner-block-topline">
        <span>{config.label}</span>
        {!readOnly && (
          <div className="planner-block-tools">
            <button type="button" disabled={busy || !canMoveUp} aria-label="Sposta blocco su" title="Sposta su" onClick={() => void move('up')}>↑</button>
            <button type="button" disabled={busy || !canMoveDown} aria-label="Sposta blocco giù" title="Sposta giù" onClick={() => void move('down')}>↓</button>
            <button className="planner-delete" type="button" disabled={busy} onClick={() => setRemoveTarget('reservation')}>Elimina</button>
          </div>
        )}
      </div>

      {loading ? (
        <span className="reservation-loading" role="status">Carico la prenotazione…</span>
      ) : (
        <>
          <div className="reservation-grid reservation-grid-essential">
            <label className="reservation-wide">
              <span>Titolo *</span>
              <input type="text" required maxLength={200} readOnly={readOnly} placeholder={config.titlePlaceholder} value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
            </label>

            <div className="reservation-fixed-start-date">
              <span>Data iniziale</span>
              <strong>{formatDayDate(dayDate)}</strong>
              <small>È la data di questa giornata e viene impostata automaticamente.</small>
            </div>

            <label>
              <span>{config.startTimeLabel}</span>
              <input type="time" readOnly={readOnly} value={startTime} onChange={(event) => updateStartTime(event.target.value)} />
            </label>

            <label>
              <span>{config.endDateLabel}</span>
              <input type="date" min={dayDate} max={tripEndDate} disabled={readOnly || !startTime} value={endDateInput} onChange={(event) => updateEndDate(event.target.value)} />
              {!startTime && <small className="reservation-field-hint">Inserisci prima {config.startTimeLabel.toLowerCase()}.</small>}
            </label>

            <label>
              <span>{config.endTimeLabel}</span>
              <input type="time" min={sameDayEnd ? startTime || undefined : undefined} disabled={readOnly || !startTime} value={endTime} onChange={(event) => updateEndTime(event.target.value)} />
              {sameDayEnd && startTime && <small className="reservation-field-hint">Non prima delle {startTime}.</small>}
            </label>

            <label>
              <span>Stato</span>
              <select disabled={readOnly} value={draft.status} onChange={(event) => patch({ status: event.target.value as ReservationDraft['status'] })}>
                {(Object.keys(statusLabels) as ReservationDraft['status'][]).map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            <label>
              <span>Luogo salvato</span>
              <select disabled={readOnly} value={draft.placeId ?? ''} onChange={(event) => patch({ placeId: event.target.value })}>
                <option value="">Nessun luogo</option>
                {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
              </select>
            </label>
          </div>

          <details className="reservation-optional">
            <summary>
              <span><strong>Dettagli prenotazione</strong><small>Fornitore, codice, fuso, link e note</small></span>
              {hasOptionalDetails && <span className="reservation-optional-state">Configurati</span>}
            </summary>
            <div className="reservation-grid reservation-optional-grid">
              <label><span>Fornitore</span><input type="text" maxLength={200} readOnly={readOnly} placeholder={config.providerPlaceholder} value={draft.provider ?? ''} onChange={(event) => patch({ provider: event.target.value })} /></label>
              <label><span>Codice prenotazione</span><input type="text" maxLength={200} readOnly={readOnly} placeholder="ABC123" value={draft.confirmationCode ?? ''} onChange={(event) => patch({ confirmationCode: event.target.value })} /></label>
              <label className="reservation-wide"><span>Fuso orario</span><input type="text" maxLength={100} readOnly={readOnly} placeholder="Europe/Paris" value={draft.timezone ?? ''} onChange={(event) => patch({ timezone: event.target.value })} /></label>
              <label className="reservation-wide"><span>Link prenotazione</span><input type="url" maxLength={2048} readOnly={readOnly} placeholder="https://…" value={draft.url ?? ''} onChange={(event) => patch({ url: event.target.value })} /></label>
              <label className="reservation-wide"><span>Note</span><textarea rows={4} maxLength={4000} readOnly={readOnly} placeholder={config.notesPlaceholder} value={draft.notes ?? ''} onChange={(event) => patch({ notes: event.target.value })} /></label>
            </div>
          </details>

          <details className="reservation-optional reservation-attachment-details">
            <summary>
              <span><strong>Allegato</strong><small>PDF o immagine · massimo 25 MiB</small></span>
              {attachment && <span className="reservation-optional-state">Presente</span>}
            </summary>
            <section className="reservation-attachment" aria-label="Allegato prenotazione">
              <div className="reservation-attachment-heading">
                <div><strong>Documento della prenotazione</strong><span>Biglietto, conferma o immagine</span></div>
                {attachmentBusy && <small role="status">Aggiornamento…</small>}
              </div>

              {attachment ? (
                <div className="reservation-attachment-current">
                  <div><strong>{attachment.originalName ?? 'Allegato'}</strong><span>{attachment.mimeType} · {formatBytes(attachment.sizeBytes)}</span></div>
                  <div className="reservation-attachment-actions">
                    <button type="button" disabled={attachmentBusy} onClick={() => void openAttachment()}>Apri</button>
                    {!readOnly && <button type="button" disabled={busy} onClick={() => setRemoveTarget('attachment')}>Rimuovi</button>}
                  </div>
                </div>
              ) : (
                <p className="reservation-attachment-empty">{reservation ? 'Nessun allegato collegato.' : 'Salva prima la prenotazione per aggiungere un allegato.'}</p>
              )}

              {removeTarget === 'attachment' && attachment && (
                <InlineConfirm
                  title="Rimuovere questo allegato?"
                  message={`Verrà scollegato “${attachment.originalName ?? 'Allegato'}” da questa prenotazione.`}
                  confirmLabel="Rimuovi allegato"
                  busy={attachmentBusy}
                  onCancel={() => setRemoveTarget(undefined)}
                  onConfirm={() => void removeAttachment()}
                />
              )}

              {!readOnly && reservation && (
                <label className={`reservation-attachment-picker${busy ? ' reservation-attachment-picker-disabled' : ''}`}>
                  <span>{attachment ? 'Sostituisci allegato' : 'Aggiungi allegato'}</span>
                  <input type="file" accept={RESERVATION_ATTACHMENT_ACCEPT} disabled={busy} onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    event.currentTarget.value = ''
                    if (file) void uploadAttachment(file)
                  }} />
                </label>
              )}
            </section>
          </details>

          {places.length === 0 && <small className="reservation-hint">Puoi prima creare un blocco Luogo per collegarlo a questa prenotazione.</small>}
          {error && <small className="planner-block-error" role="alert">{error}</small>}
          {removeTarget === 'reservation' && (
            <InlineConfirm
              title={`Eliminare ${config.label.toLowerCase()}?`}
              message={reservation
                ? `Verranno rimossi il blocco e la prenotazione “${reservation.title}”.${attachment ? ' Anche il collegamento all’allegato verrà rimosso.' : ''}`
                : `Verrà rimosso questo blocco ${config.label.toLowerCase()} dalla giornata.`}
              confirmLabel={`Elimina ${config.label.toLowerCase()}`}
              busy={saving}
              onCancel={() => setRemoveTarget(undefined)}
              onConfirm={() => void remove()}
            />
          )}

          <div className="reservation-actions">
            {reservation?.url && <a href={reservation.url} target="_blank" rel="noreferrer">Apri prenotazione ↗</a>}
            {!readOnly && <button type="submit" disabled={busy}>{saving ? 'Salvataggio…' : reservation ? 'Salva prenotazione' : 'Crea prenotazione'}</button>}
          </div>
        </>
      )}
    </form>
  )
}
