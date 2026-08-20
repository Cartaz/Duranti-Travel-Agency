import { FormEvent, useEffect, useState } from 'react'
import type { Block, Place, Reservation } from '../../domain/entities'
import { movePlannerBlock } from '../planner/block-service'
import {
  deletePlannerReservationBlock,
  EMPTY_RESERVATION_DRAFT,
  getPlannerReservation,
  listSavedPlaces,
  reservationToDraft,
  savePlannerReservation,
  type ReservationDraft,
} from './reservation-service'
import './reservations.css'

type MoveDirection = 'up' | 'down'

const statusLabels: Record<ReservationDraft['status'], string> = {
  planned: 'Da pianificare',
  booked: 'Prenotato',
  completed: 'Completato',
  cancelled: 'Annullato',
}

function blockLabel(block: Block): string {
  return block.type === 'accommodation' ? 'Alloggio' : 'Trasporto'
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
  const [reservation, setReservation] = useState<Reservation>()
  const [places, setPlaces] = useState<Place[]>([])
  const [draft, setDraft] = useState<ReservationDraft>(EMPTY_RESERVATION_DRAFT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void Promise.all([
      getPlannerReservation(tripId, dayId, block.id),
      listSavedPlaces(),
    ])
      .then(([loadedReservation, loadedPlaces]) => {
        if (cancelled) return
        setReservation(loadedReservation)
        setPlaces(loadedPlaces)
        setDraft(loadedReservation ? reservationToDraft(loadedReservation) : EMPTY_RESERVATION_DRAFT)
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
  }, [block.id, block.updatedAt, dayId, tripId])

  const patch = (changes: Partial<ReservationDraft>): void => setDraft((current) => ({ ...current, ...changes }))

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (readOnly || saving) return
    setSaving(true)
    setError('')
    try {
      const saved = await savePlannerReservation(tripId, dayId, block.id, draft)
      setReservation(saved)
      setDraft(reservationToDraft(saved))
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare la prenotazione.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (readOnly || saving || !window.confirm(`Eliminare questo blocco ${blockLabel(block).toLowerCase()} e la relativa prenotazione?`)) return
    setSaving(true)
    setError('')
    try {
      await deletePlannerReservationBlock(tripId, dayId, block.id)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile eliminare la prenotazione.')
      setSaving(false)
    }
  }

  const move = async (direction: MoveDirection): Promise<void> => {
    if (readOnly || saving) return
    setSaving(true)
    setError('')
    try {
      await movePlannerBlock(tripId, dayId, block.id, direction)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile spostare la prenotazione.')
    } finally {
      setSaving(false)
    }
  }

  const startMin = `${dayDate}T00:00`
  const startMax = `${dayDate}T23:59`
  const endMax = tripEndDate ? `${tripEndDate}T23:59` : undefined

  return (
    <form className="planner-block reservation-block" onSubmit={(event) => void save(event)}>
      <div className="planner-block-topline">
        <span>{blockLabel(block)}</span>
        {!readOnly && (
          <div className="planner-block-tools">
            <button type="button" disabled={saving || !canMoveUp} aria-label="Sposta blocco su" title="Sposta su" onClick={() => void move('up')}>↑</button>
            <button type="button" disabled={saving || !canMoveDown} aria-label="Sposta blocco giù" title="Sposta giù" onClick={() => void move('down')}>↓</button>
            <button className="planner-delete" type="button" disabled={saving} onClick={() => void remove()}>Elimina</button>
          </div>
        )}
      </div>

      {loading ? (
        <span className="reservation-loading" role="status">Carico la prenotazione…</span>
      ) : (
        <>
          <div className="reservation-grid">
            <label className="reservation-wide">
              <span>Titolo *</span>
              <input
                type="text"
                required
                maxLength={200}
                readOnly={readOnly}
                placeholder={block.type === 'accommodation' ? 'Hotel a Parigi' : 'Volo Roma → Parigi'}
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </label>
            <label>
              <span>Fornitore</span>
              <input type="text" maxLength={200} readOnly={readOnly} placeholder="Trenitalia, ITA, hotel…" value={draft.provider ?? ''} onChange={(event) => patch({ provider: event.target.value })} />
            </label>
            <label>
              <span>Codice prenotazione</span>
              <input type="text" maxLength={200} readOnly={readOnly} placeholder="ABC123" value={draft.confirmationCode ?? ''} onChange={(event) => patch({ confirmationCode: event.target.value })} />
            </label>
            <label>
              <span>Stato</span>
              <select disabled={readOnly} value={draft.status} onChange={(event) => patch({ status: event.target.value as ReservationDraft['status'] })}>
                {(Object.keys(statusLabels) as ReservationDraft['status'][]).map((status) => (
                  <option value={status} key={status}>{statusLabels[status]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Luogo salvato</span>
              <select disabled={readOnly} value={draft.placeId ?? ''} onChange={(event) => patch({ placeId: event.target.value })}>
                <option value="">Nessun luogo</option>
                {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
              </select>
            </label>
            <label>
              <span>Inizio</span>
              <input type="datetime-local" min={startMin} max={startMax} readOnly={readOnly} value={draft.startsAt ?? ''} onChange={(event) => patch({ startsAt: event.target.value })} />
            </label>
            <label>
              <span>Fine</span>
              <input type="datetime-local" min={draft.startsAt || startMin} max={endMax} readOnly={readOnly} value={draft.endsAt ?? ''} onChange={(event) => patch({ endsAt: event.target.value })} />
            </label>
            <label className="reservation-wide">
              <span>Fuso orario</span>
              <input type="text" maxLength={100} readOnly={readOnly} placeholder="Europe/Paris" value={draft.timezone ?? ''} onChange={(event) => patch({ timezone: event.target.value })} />
            </label>
            <label className="reservation-wide">
              <span>Link prenotazione</span>
              <input type="url" maxLength={2048} readOnly={readOnly} placeholder="https://…" value={draft.url ?? ''} onChange={(event) => patch({ url: event.target.value })} />
            </label>
            <label className="reservation-wide">
              <span>Note</span>
              <textarea rows={4} maxLength={4000} readOnly={readOnly} placeholder="Terminal, check-in, bagagli, dettagli utili…" value={draft.notes ?? ''} onChange={(event) => patch({ notes: event.target.value })} />
            </label>
          </div>

          {places.length === 0 && <small className="reservation-hint">Puoi prima creare un blocco Luogo per collegarlo a questa prenotazione.</small>}
          {error && <small className="planner-block-error">{error}</small>}

          <div className="reservation-actions">
            {reservation?.url && <a href={reservation.url} target="_blank" rel="noreferrer">Apri prenotazione ↗</a>}
            {!readOnly && <button type="submit" disabled={saving}>{saving ? 'Salvataggio…' : reservation ? 'Salva prenotazione' : 'Crea prenotazione'}</button>}
          </div>
        </>
      )}
    </form>
  )
}
