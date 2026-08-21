import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
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
import {
  resolveOrphanedItineraryItem,
  type OrphanResolutionAction,
} from './itinerary-orphan-service'
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

type PendingItineraryAction =
  | { kind: 'delete-manual'; item: DayItineraryItem }
  | { kind: 'convert-orphan'; item: DayItineraryItem }
  | { kind: 'delete-orphan'; item: DayItineraryItem }

function timeLabel(value: string | undefined): string {
  if (!value) return 'Senza orario'
  const time = value.slice(11, 16)
  return /^\d{2}:\d{2}$/.test(time) ? time : value
}

function formatReadableDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, day))
}

function hasSourceReference(item: DayItineraryItem): boolean {
  return Boolean(item.itinerary.reservationId || item.itinerary.blockId)
}

function isIndependentManualItem(item: DayItineraryItem): boolean {
  return item.source === 'manual' && !hasSourceReference(item)
}

function isOrphanedItem(item: DayItineraryItem): boolean {
  return item.syncState === 'orphaned' || (item.source === 'manual' && hasSourceReference(item))
}

function attentionLabel(item: DayItineraryItem): string | undefined {
  if (isOrphanedItem(item)) return 'Controlla questa tappa'
  if (item.syncState === 'needs-sync') return 'Aggiornamento disponibile'
  return undefined
}

function itineraryDisplayGroup(item: DayItineraryItem): number {
  if (item.itinerary.startsAt) return 0
  if (!isIndependentManualItem(item)) return 1
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

function pendingActionCopy(action: PendingItineraryAction): { message: string; confirmLabel: string } {
  if (action.kind === 'convert-orphan') {
    return {
      message: `Vuoi conservare “${action.item.itinerary.title}” come tappa indipendente? I dati visibili resteranno, mentre il collegamento non più valido verrà rimosso.`,
      confirmLabel: 'Conserva tappa',
    }
  }

  return {
    message: `Vuoi rimuovere “${action.item.itinerary.title}” dall’itinerario?`,
    confirmLabel: 'Rimuovi tappa',
  }
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
  const [pendingAction, setPendingAction] = useState<PendingItineraryAction>()
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
    .filter((item) => isIndependentManualItem(item) && !item.itinerary.startsAt)
    .map((item) => item.itinerary.id)
  const needsSyncCount = items.filter((item) => item.syncState === 'needs-sync').length
  const orphanedCount = items.filter(isOrphanedItem).length
  const editingItem = editingId && editingId !== 'new'
    ? items.find((item) => item.itinerary.id === editingId && isIndependentManualItem(item))
    : undefined

  const reconcile = async (): Promise<void> => {
    if (readOnly || busy || needsSyncCount === 0) return
    setBusy(true)
    setError('')
    try {
      await reconcileDayReservationItineraries(tripId, dayId)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile aggiornare le tappe collegate alle prenotazioni.')
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

  const removeManual = (item: DayItineraryItem): void => {
    if (readOnly || busy || !isIndependentManualItem(item)) return
    setPendingAction({ kind: 'delete-manual', item })
  }

  const moveManual = async (
    item: DayItineraryItem,
    direction: ManualItineraryMoveDirection,
  ): Promise<void> => {
    if (readOnly || busy || !isIndependentManualItem(item) || item.itinerary.startsAt) return
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

  const resolveOrphan = (item: DayItineraryItem, action: OrphanResolutionAction): void => {
    if (readOnly || busy || !isOrphanedItem(item)) return
    setPendingAction({
      kind: action === 'convert-to-manual' ? 'convert-orphan' : 'delete-orphan',
      item,
    })
  }

  const confirmPendingAction = async (): Promise<void> => {
    if (!pendingAction || readOnly || busy) return
    const action = pendingAction
    setBusy(true)
    setError('')

    try {
      if (action.kind === 'delete-manual') {
        await deleteManualItineraryItem(tripId, dayId, action.item.itinerary.id)
      } else {
        await resolveOrphanedItineraryItem(
          tripId,
          dayId,
          action.item.itinerary.id,
          action.kind === 'convert-orphan' ? 'convert-to-manual' : 'delete',
        )
      }
      if (editingId === action.item.itinerary.id) setEditingId(undefined)
      setPendingAction(undefined)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile completare la modifica richiesta.')
    } finally {
      setBusy(false)
    }
  }

  const confirmation = pendingAction ? pendingActionCopy(pendingAction) : undefined

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
              Aggiorna {needsSyncCount}
            </button>
          )}
          {!readOnly && (
            <button type="button" disabled={busy || editingId === 'new'} onClick={() => setEditingId('new')}>
              + Aggiungi tappa
            </button>
          )}
        </div>
      </div>

      {orphanedCount > 0 && (
        <p className="day-itinerary-warning" role="status">
          {orphanedCount === 1
            ? 'Una tappa non è più collegata alla prenotazione o al blocco originale. Puoi conservarla così com’è oppure rimuoverla.'
            : `${orphanedCount} tappe non sono più collegate alla prenotazione o al blocco originale. Puoi conservarle così come sono oppure rimuoverle.`}
        </p>
      )}
      {error && <p className="day-itinerary-error" role="alert">{error}</p>}

      {confirmation && (
        <div className="day-itinerary-confirm" role="alertdialog" aria-live="assertive">
          <div>
            <strong>Conferma modifica</strong>
            <p>{confirmation.message}</p>
          </div>
          <div className="day-itinerary-confirm-actions">
            <button type="button" disabled={busy} onClick={() => setPendingAction(undefined)}>Annulla</button>
            <button type="button" disabled={busy} onClick={() => void confirmPendingAction()}>
              {busy ? 'Operazione…' : confirmation.confirmLabel}
            </button>
          </div>
        </div>
      )}

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
          <span>Aggiungi una tappa oppure salva una prenotazione nel planner.</span>
        </div>
      ) : (
        <ol className="day-itinerary-list">
          {displayItems.map((item) => {
            const { itinerary, place } = item
            const independentManual = isIndependentManualItem(item)
            const orphaned = isOrphanedItem(item)
            const attention = attentionLabel(item)
            const attentionState = orphaned ? 'orphaned' : 'needs-sync'
            const untimedManualIndex = independentManual && !itinerary.startsAt
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
                    {attention && (
                      <span className={`day-itinerary-sync day-itinerary-sync-${attentionState}`}>
                        {attention}
                      </span>
                    )}
                  </div>
                  {!readOnly && independentManual && (
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
                      <button type="button" disabled={busy} onClick={() => removeManual(item)}>Elimina</button>
                    </div>
                  )}
                  {!readOnly && orphaned && (
                    <div className="day-itinerary-item-actions">
                      <button type="button" disabled={busy} onClick={() => resolveOrphan(item, 'convert-to-manual')}>
                        Conserva come tappa
                      </button>
                      <button type="button" disabled={busy} onClick={() => resolveOrphan(item, 'delete')}>
                        Rimuovi
                      </button>
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
  const [endDate, setEndDate] = useState(initialDraft.endsAt?.slice(0, 10) ?? dayDate)
  const patch = (changes: Partial<ItineraryDraft>): void => setDraft((current) => ({ ...current, ...changes }))
  const startTime = draft.startsAt?.slice(11, 16) ?? ''
  const endTime = draft.endsAt?.slice(11, 16) ?? ''

  const updateStartTime = (value: string): void => {
    if (!value) {
      setEndDate(dayDate)
      patch({ startsAt: undefined, endsAt: undefined })
      return
    }

    const startsAt = `${dayDate}T${value}`
    patch({
      startsAt,
      endsAt: draft.endsAt && draft.endsAt < startsAt ? undefined : draft.endsAt,
    })
  }

  const updateEndDate = (value: string): void => {
    setEndDate(value)
    if (endTime) patch({ endsAt: `${value}T${endTime}` })
  }

  const updateEndTime = (value: string): void => {
    patch({ endsAt: value ? `${endDate}T${value}` : undefined })
  }

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
          <span>Ora inizio</span>
          <input type="time" value={startTime} onChange={(event) => updateStartTime(event.target.value)} />
          <small className="day-itinerary-form-hint">Data fissata alla giornata: {formatReadableDate(dayDate)}.</small>
        </label>
        <label>
          <span>Data fine</span>
          <input
            type="date"
            min={dayDate}
            max={tripEndDate}
            disabled={!startTime}
            value={endDate}
            onChange={(event) => updateEndDate(event.target.value)}
          />
        </label>
        <label>
          <span>Ora fine</span>
          <input
            type="time"
            min={endDate === dayDate ? startTime || undefined : undefined}
            disabled={!startTime}
            value={endTime}
            onChange={(event) => updateEndTime(event.target.value)}
          />
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
