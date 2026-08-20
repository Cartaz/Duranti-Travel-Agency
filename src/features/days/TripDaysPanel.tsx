import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Day, Trip } from '../../domain/entities'
import { listTripDays } from './day-service'
import './days.css'

function formatDayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })
    .format(new Date(year, month - 1, day))
}

export default function TripDaysPanel({ trip }: { trip: Trip }) {
  const [days, setDays] = useState<Day[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void listTripDays(trip.id)
      .then((items) => {
        if (!cancelled) setDays(items)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere le giornate.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [trip.id])

  return (
    <section className="days-panel" aria-labelledby="trip-days-title">
      <div className="days-panel-heading">
        <div>
          <p className="eyebrow">Pagine del viaggio</p>
          <h2 id="trip-days-title">Giornate</h2>
          <p>Ogni giornata è una pagina ordinata del capitolo. Nel blocco successivo conterrà i primi blocchi del planner.</p>
        </div>
        <Link className="trip-primary-action" to={`/trips/${trip.id}/days/new`}>Nuova giornata</Link>
      </div>

      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}
      {loading && <p className="trip-feedback" role="status">Apro le pagine del viaggio…</p>}

      {!loading && days.length === 0 && (
        <div className="days-empty">
          <strong>Il capitolo non ha ancora giornate.</strong>
          <span>Crea la prima pagina per iniziare a costruire l’itinerario.</span>
        </div>
      )}

      {days.length > 0 && (
        <ol className="day-list">
          {days.map((day) => (
            <li className="day-card" key={day.id}>
              <span className="day-sequence" aria-label={`Giorno ${day.sequence}`}>{String(day.sequence).padStart(2, '0')}</span>
              <div className="day-card-copy">
                <span>{formatDayDate(day.date)}</span>
                <strong>{day.title ?? `Giorno ${day.sequence}`}</strong>
                {day.summary && <p>{day.summary}</p>}
              </div>
              <Link className="day-edit-link" to={`/trips/${trip.id}/days/${day.id}/edit`} aria-label={`Modifica ${day.title ?? `giorno ${day.sequence}`}`}>
                Modifica
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
