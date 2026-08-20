import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Trip } from '../../domain/entities'
import { getTrip } from './trip-service'
import './trips.css'

const statusLabel: Record<Exclude<Trip['status'], 'archived'>, string> = {
  planned: 'Pianificato',
  ongoing: 'In corso',
  completed: 'Concluso',
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Da definire'
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, day))
}

export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const [trip, setTrip] = useState<Trip>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tripId) {
      setError('Identificatore del viaggio mancante.')
      setLoading(false)
      return
    }

    let cancelled = false
    void getTrip(tripId)
      .then((item) => {
        if (cancelled) return
        if (!item || item.status === 'archived') {
          setError('Viaggio non trovato.')
          return
        }
        setTrip(item)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile aprire il viaggio.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tripId])

  if (loading) return <p className="trip-feedback" role="status">Apro il capitolo…</p>

  if (!trip || trip.status === 'archived') {
    return (
      <section className="trip-detail-page">
        <p className="trip-feedback trip-feedback-error" role="alert">{error || 'Viaggio non trovato.'}</p>
        <Link className="trip-text-link" to="/">Torna all’indice</Link>
      </section>
    )
  }

  return (
    <article className="trip-detail-page" aria-labelledby="trip-detail-title">
      <div className="trip-page-heading">
        <div>
          <p className="eyebrow">Capitolo</p>
          <h1 id="trip-detail-title">{trip.title}</h1>
          {trip.subtitle && <p className="trip-detail-subtitle">{trip.subtitle}</p>}
        </div>
        <Link className="trip-secondary-action" to={`/trips/${trip.id}/edit`}>Modifica</Link>
      </div>

      <div className="trip-detail-grid">
        <section className="trip-detail-panel">
          <p className="eyebrow">Stato</p>
          <strong>{statusLabel[trip.status]}</strong>
        </section>
        <section className="trip-detail-panel">
          <p className="eyebrow">Partenza</p>
          <strong>{formatDate(trip.startDate)}</strong>
        </section>
        <section className="trip-detail-panel">
          <p className="eyebrow">Ritorno</p>
          <strong>{formatDate(trip.endDate)}</strong>
        </section>
        <section className="trip-detail-panel">
          <p className="eyebrow">Valuta</p>
          <strong>{trip.currency ?? 'Da definire'}</strong>
        </section>
      </div>

      <section className="trip-summary-panel">
        <p className="eyebrow">Appunti del capitolo</p>
        <p>{trip.summary ?? 'Nessun riepilogo ancora. Puoi aggiungere le prime idee modificando il viaggio.'}</p>
      </section>

      <section className="trip-next-panel">
        <div>
          <p className="eyebrow">Pagine del viaggio</p>
          <h2>Il planner giornaliero arriva nel prossimo blocco.</h2>
          <p>Questo capitolo ora è persistito davvero offline. Il prossimo passo aggiungerà giorni e prime pagine editabili.</p>
        </div>
        <span className="trip-next-mark" aria-hidden="true">01</span>
      </section>

      <Link className="trip-text-link" to="/">← Torna all’indice</Link>
    </article>
  )
}
