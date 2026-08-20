import { FormEvent, useEffect, useState } from 'react'
import type { Place } from '../../domain/entities'
import {
  deleteManualItineraryItem,
  EMPTY_ITINERARY_DRAFT,
  itineraryToDraft,
  listItineraryPlaces,
  reconcileDayReservationItineraries,
  saveManualItineraryItem,
  type DayItineraryItem,
  type EditableItineraryStatus,
  type EditableItineraryType,
  type ItineraryDraft,
} from './itinerary-service'
import {
  moveManualUntimedItineraryItem,
  type ManualItineraryMoveDirection,
} from './itinerary-order-service'
import './itinerary.css'

const typeLabels: Record<EditableItineraryType, string> = {
  transport: 'Trasporto',
  activity: 'Attività',
  meal: 'Pasto',
  reservation: 'Prenotazione',
  'free-time': 'Tempo libero',
  custom: 'Altro',
}

const statusLabels: Record<EditableItineraryStatus, string> = {
  idea: 'Idea',
  planned: 'Pianificato',
  booked: 'Prenotato',
  done: 'Fatto',
  cancelled: 'Annullato',
}

function timeLabel(value: string | undefined): string {
  if (!value) return 'Senza orario'
  const time = value.slice(11, 16)
  return /^\d{2}:\d{2}$/.test(time) ? time : value
}

function syncLabel(item: DayItineraryItem): string {
  if (item.source === 'manual') return 'Manuale'
  if (item.syncState === 'synced') return 'Da prenotazione'
  if (item.syncState === 'needs-sync') return 'Da riallineare'
  return 'Collegamento da verificare'
}

function itineraryDisplayGroup(item: DayItineraryItem): number {
  if (item.itinerary.startsAt) return 0
  if (item.source === 'reservation') return 1
  return 2
}

function orderItineraryForDisplay(items: DayItineraryItem[]): DayItineraryItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftGroup = itineraryDisplayGroup(left.item)
      const rightGroup = itineraryDisplayGroup(right.item)
      if (leftGroup !== rightGroup) return leftGroup - rightGroup

      if (leftGroup === 0) {
        return (left.item.itinerary.startsAt ?? '').localeCompare(right.item.itinerary.startsAt ?? '')
          || left.index - right.index
      }

      if (leftGroup === 1) return left.index - right.index

      return (left.item.itinerary.position ?? Number.MAX_SAFE_INTEGER)
        - (right.item.itinerary.position ?? Number.MAX_SAFE_INTEGER)
        || left.item.itinerary.createdAt.localeCompare(right.item.itinerary.createdAt)
        || left.item.itinerary.id.localeCompare(right.item.itinerary.id)
    })
    .map(({ item }) => item)
}

export default function DayItinerarySummary({
  items,
  tripId,
  dayId,
  dayDate,
  tripEndDate,
  readOnly,
  onChanged,
}: {
  items: DayItineraryItem[]
  tripId: string
  dayId: string
  dayDate: string
  tripEndDate?: string
  readOnly: boolean
  onChanged: () => Promise<void>
}) {
  const [places, setPlaces] = useState<Place[]>([])
  const [editingId, setEditingId] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void listItineraryPlaces()
      .then((loadedPlaces) => {
        if (!cancelled) setPlaces(loadedPlaces)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere i luoghi disponibili.')
      })
    return () => {
      cancelled = true
    }
  }, [dayId, tripId])

  if (items.length === 0 && readOnly) return null

  const displayItems = orderItineraryForDisplay(items)
  const manualUntimedIds = displayItems
    .filter((item) => item.source === 'manual' && !item.itinerary.startsAt)
    .map((item) => item.itinerary.id)
  const needsSyncCount = items.filter((item) => item.syncState === 'needs-sync').length
  const orphanedCount = items.filter((item) => item.syncState === 'orphaned').length
  const editingItem = editingId && editingId !== 'new'
    ? items.find((item) => item.itinerary.id === editingId && item.source === 'manual')
    : undefined

  const reconcile = async (): Promise<void> => {
    if (readOnly || busy || needsSyncCount === 0) return
    setBusy(true)
    setError('')
    try {
      await reconcileDayReservationItineraries(tripId, dayId)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile riallineare l’itinerario.')
    } finally {
      setBusy(false)
    }
  }

  const saveManual = async (draft: ItineraryDraft): Promise<void> => {
    if (readOnly || busy) return
    setBusy(true)
    setError('')
    try {
      await saveManualItineraryItem(tripId, dayId, editingItem?.itinerary.id, draft)
      setEditingId(undefined)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare la tappa.')
    } finally {
      setBusy(false)
    }
  }

  const removeManual = async (item: DayItineraryItem): Promise<void> => {
    if (readOnly || busy || item.source !== 'manual') return
    if (!window.confirm(`Eliminare la tappa “${item.itinerary.title}” dall’itinerario?`)) return
    setBusy(true)
    setError('')
    try {
      await deleteManualItineraryItem(tripId, dayId, item.itinerary.id)
      if (editingId === item.itinerary.id) setEditingId(undefined)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile eliminare la tappa.')
    } finally {
      setBusy(false)
    }
  }

  const moveManual = async (
    item: DayItineraryItem,
    direction: ManualItineraryMoveDirection,
  ): Promise<void> => {
    if (readOnly || busy || item.source !== 'manual' || item.itinerary.startsAt) return
    setBusy(true)
    setError('')
    try {
      await moveManualUntimedItineraryItem(tripId, dayId, item.itinerary.id, direction)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile riordinare la tappa.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="day-itinerary" aria-labelledby="day-itinerary-title">
      <div className="day-itinerary-heading">
        <div>
          <p className="eyebrow">Sequenza della giornata</p>
          <h2 id="day-itinerary-title">Itinerario</h2>
        </div>
        <div className="day-itinerary-heading-actions">
          <span>{items.length} {items.length === 1 ? 'tappa' : 'tappe'}</span>
          {!readOnly && needsSyncCount > 0 && (
            <button type="button" disabled={busy} onClick={() => void reconcile()}>
              Riallinea {needsSyncCount}
            </button>
          )}
          {!readOnly && (
            <button type="button" disabled={busy || editingId === 'new'} onClick={() => setEditingId('new')}>
              + Tappa libera
            </button>
          )}
        </div>
      </div>

      {orphanedCount > 0 && (
        <p className="day-itinerary-warning" role="status">
          {orphanedCount} {orphanedCount === 1 ? 'tappa contiene' : 'tappe contengono'} un collegamento che non può essere riallineato automaticamente.
        </p>
      )}
      {error && <p className="day-itinerary-error" role="alert">{error}</p>}

      {editingId && (
        <ManualItineraryForm
          key={editingId}
          initialDraft={editingItem ? itineraryToDraft(editingItem.itinerary) : EMPTY_ITINERARY_DRAFT}
          places={places}
          dayDate={dayDate}
          tripEndDate={tripEndDate}
          saving={busy}
          onCancel={() => setEditingId(undefined)}
          onSave={saveManual}
        />
      )}

      {items.length === 0 ? (
        <div className="day-itinerary-empty">
          <strong>Nessuna tappa ancora.</strong>
          <span>Aggiungi una tappa libera oppure salva una prenotazione nel planner.</span>
        </div>
      ) : (
        <ol className="day-itinerary-list">
          {displayItems.map((item) => {
            const { itinerary, place } = item
            const untimedManualIndex = item.source === 'manual' && !itinerary.startsAt
              ? manualUntimedIds.indexOf(itinerary.id)
              : -1
            return (
              <li key={itinerary.id} className={itinerary.status === 'cancelled' ? 'day-itinerary-cancelled' : undefined}>
                <time dateTime={itinerary.startsAt}>{timeLabel(itinerary.startsAt)}</time>
                <div className="day-itinerary-marker" aria-hidden="true" />
                <div className="day-itinerary-content">
                  <div className="day-itinerary-title-row">
                    <strong>{itinerary.title}</strong>
                    <span>{typeLabels[itinerary.type ?? 'custom']}</span>
                  </div>
                  <div className="day-itinerary-meta">
                    {place && <span>{place.name}</span>}
                    {itinerary.status && <span>{statusLabels[itinerary.status]}</span>}
                    {itinerary.bookingReference && <span>Codice {itinerary.bookingReference}</span>}
                    {itinerary.endsAt && <span>fino alle {timeLabel(itinerary.endsAt)}</span>}
                    <span className={`day-itinerary-sync day-itinerary-sync-${item.syncState}`}>{syncLabel(item)}</span>
                  </div>
                  {!readOnly && item.source === 'manual' && (
                    <div className="day-itinerary-item-actions">
                      {untimedManualIndex >= 0 && (
                        <>
                          <button
                            type="button"
                            disabled={busy || untimedManualIndex === 0}
                            aria-label={`Sposta ${itinerary.title} su`}
                            title="Sposta su"
                            onClick={() => void moveManual(item, 'up')}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={busy || untimedManualIndex === manualUntimedIds.length - 1}
                            aria-label={`Sposta ${itinerary.title} giù`}
                            title="Sposta giù"
                            onClick={() => void moveManual(item, 'down')}
                          >
                            ↓
                          </button>
                        </>
                      )}
                      <button type="button" disabled={busy} onClick={() => setEditingId(itinerary.id)}>Modifica</button>
                      <button type="button" disabled={busy} onClick={() => void removeManual(item)}>Elimina</button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function ManualItineraryForm({
  initialDraft,
  places,
  dayDate,
  tripEndDate,
  saving,
  onCancel,
  onSave,
}: {
  initialDraft: ItineraryDraft
  places: Place[]
  dayDate: string
  tripEndDate?: string
  saving: boolean
  onCancel: () => void
  onSave: (draft: ItineraryDraft) => Promise<void>
}) {
  const [draft, setDraft] = useState<ItineraryDraft>(initialDraft)
  const patch = (changes: Partial<ItineraryDraft>): void => setDraft((current) => ({ ...current, ...changes }))
  const startMin = `${dayDate}T00:00`
  const startMax = `${dayDate}T23:59`
  const endMax = tripEndDate ? `${tripEndDate}T23:59` : undefined

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void onSave(draft)
  }

  return (
    <form className="day-itinerary-form" onSubmit={submit}>
      <div className="day-itinerary-form-grid">
        <label className="day-itinerary-form-wide">
          <span>Titolo *</span>
          <input required maxLength={200} value={draft.title} onChange={(event) => patch({ title: event.target.value })} placeholder="Passeggiata lungo la Senna" />
        </label>
        <label>
          <span>Tipo</span>
          <select value={draft.type} onChange={(event) => patch({ type: event.target.value as EditableItineraryType })}>
            {(Object.keys(typeLabels) as EditableItineraryType[]).map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
          </select>
        </label>
        <label>
          <span>Stato</span>
          <select value={draft.status} onChange={(event) => patch({ status: event.target.value as EditableItineraryStatus })}>
            {(Object.keys(statusLabels) as EditableItineraryStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <label>
          <span>Inizio</span>
          <input type="datetime-local" min={startMin} max={startMax} value={draft.startsAt ?? ''} onChange={(event) => patch({ startsAt: event.target.value })} />
        </label>
        <label>
          <span>Fine</span>
          <input type="datetime-local" min={draft.startsAt || startMin} max={endMax} value={draft.endsAt ?? ''} onChange={(event) => patch({ endsAt: event.target.value })} />
        </label>
        <label>
          <span>Luogo salvato</span>
          <select value={draft.placeId ?? ''} onChange={(event) => patch({ placeId: event.target.value })}>
            <option value="">Nessun luogo</option>
            {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
          </select>
        </label>
        <label>
          <span>Fuso orario</span>
          <input maxLength={100} value={draft.timezone ?? ''} onChange={(event) => patch({ timezone: event.target.value })} placeholder="Europe/Paris" />
        </label>
        <label className="day-itinerary-form-wide">
          <span>Riferimento</span>
          <input maxLength={200} value={draft.bookingReference ?? ''} onChange={(event) => patch({ bookingReference: event.target.value })} placeholder="Biglietto, codice o riferimento libero" />
        </label>
        <label className="day-itinerary-form-wide">
          <span>Note</span>
          <textarea rows={3} maxLength={4000} value={draft.notes ?? ''} onChange={(event) => patch({ notes: event.target.value })} placeholder="Indicazioni e dettagli utili…" />
        </label>
      </div>
      <div className="day-itinerary-form-actions">
        <button type="button" disabled={saving} onClick={onCancel}>Annulla</button>
        <button type="submit" disabled={saving}>{saving ? 'Salvataggio…' : 'Salva tappa'}</button>
      </div>
    </form>
  )
}
