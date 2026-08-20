import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DayItineraryItem, EditableItineraryStatus, EditableItineraryType } from './itinerary-service'
import {
  listTripItineraryOverview,
  type TripItineraryOverview as TripItineraryOverviewData,
} from './trip-itinerary-service'
import './trip-itinerary.css'

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

function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(year, month - 1, day))
}

function timeLabel(value: string | undefined): string {
  if (!value) return 'Senza orario'
  const time = value.slice(11, 16)
  return /^\d{2}:\d{2}$/.test(time) ? time : value
}

function hasSourceReference(item: DayItineraryItem): boolean {
  return Boolean(item.itinerary.reservationId || item.itinerary.blockId)
}

function isIndependentManualItem(item: DayItineraryItem): boolean {
  return item.source === 'manual' && !hasSourceReference(item)
}

function displayGroup(item: DayItineraryItem): number {
  if (item.itinerary.startsAt) return 0
  if (!isIndependentManualItem(item)) return 1
  return 2
}

function orderItems(items: DayItineraryItem[]): DayItineraryItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftGroup = displayGroup(left.item)
      const rightGroup = displayGroup(right.item)
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

function stateLabel(item: DayItineraryItem): string {
  if (item.source === 'manual' && hasSourceReference(item)) return 'Collegamento da verificare'
  if (item.syncState === 'orphaned') return 'Collegamento da verificare'
  if (item.syncState === 'needs-sync') return 'Da riallineare'
  if (item.source === 'reservation') return 'Da prenotazione'
  return 'Manuale'
}

function stateClass(item: DayItineraryItem): string {
  if (item.source === 'manual' && hasSourceReference(item)) return 'orphaned'
  return item.syncState
}

export default function TripItineraryOverview({ tripId }: { tripId: string }) {
  const [overview, setOverview] = useState<TripItineraryOverviewData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    void listTripItineraryOverview(tripId)
      .then((result) => {
        if (!cancelled) setOverview(result)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere l’itinerario del viaggio.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tripId])

  return (
    <section className="trip-itinerary-overview" aria-labelledby="trip-itinerary-overview-title">
      <div className="trip-itinerary-overview-heading">
        <div>
          <p className="eyebrow">Viaggio in sequenza</p>
          <h2 id="trip-itinerary-overview-title">Itinerario completo</h2>
          <p>Una lettura continua delle giornate e delle tappe già presenti nel planner.</p>
        </div>
        {overview && (
          <div className="trip-itinerary-overview-stats" aria-label="Riepilogo itinerario">
            <span>{overview.days.length} {overview.days.length === 1 ? 'giornata' : 'giornate'}</span>
            <strong>{overview.stopCount} {overview.stopCount === 1 ? 'tappa' : 'tappe'}</strong>
            {overview.warningCount > 0 && <span className="trip-itinerary-overview-warning">{overview.warningCount} da verificare</span>}
          </div>
        )}
      </div>

      {loading && <p className="trip-feedback" role="status">Compongo l’itinerario completo…</p>}
      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}

      {!loading && !error && overview?.days.length === 0 && (
        <div className="trip-itinerary-overview-empty">
          <strong>Nessuna giornata ancora.</strong>
          <span>Crea la prima giornata per iniziare a costruire l’itinerario completo.</span>
        </div>
      )}

      {!loading && !error && overview && overview.days.length > 0 && (
        <ol className="trip-itinerary-days">
          {overview.days.map(({ day, items }) => {
            const orderedItems = orderItems(items)
            return (
              <li className="trip-itinerary-day" key={day.id}>
                <header className="trip-itinerary-day-heading">
                  <div className="trip-itinerary-day-number" aria-label={`Giorno ${day.sequence}`}>
                    {String(day.sequence).padStart(2, '0')}
                  </div>
                  <div>
                    <span>{formatDate(day.date)}</span>
                    <h3>{day.title ?? `Giorno ${day.sequence}`}</h3>
                    {day.summary && <p>{day.summary}</p>}
                  </div>
                  <Link to={`/trips/${tripId}/days/${day.id}`}>Apri giornata</Link>
                </header>

                {orderedItems.length === 0 ? (
                  <p className="trip-itinerary-day-empty">Nessuna tappa pianificata.</p>
                ) : (
                  <ol className="trip-itinerary-stops">
                    {orderedItems.map((item) => {
                      const { itinerary, place } = item
                      return (
                        <li key={itinerary.id} className={itinerary.status === 'cancelled' ? 'trip-itinerary-stop-cancelled' : undefined}>
                          <time dateTime={itinerary.startsAt}>{timeLabel(itinerary.startsAt)}</time>
                          <div className="trip-itinerary-stop-copy">
                            <strong>{itinerary.title}</strong>
                            <div className="trip-itinerary-stop-meta">
                              <span>{typeLabels[itinerary.type ?? 'custom']}</span>
                              {place && <span>{place.name}</span>}
                              {itinerary.status && <span>{statusLabels[itinerary.status]}</span>}
                              {itinerary.endsAt && <span>fino alle {timeLabel(itinerary.endsAt)}</span>}
                              <span className={`trip-itinerary-state trip-itinerary-state-${stateClass(item)}`}>
                                {stateLabel(item)}
                              </span>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
