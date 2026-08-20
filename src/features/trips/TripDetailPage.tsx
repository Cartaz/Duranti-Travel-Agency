import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Trip } from '../../domain/entities'
import TripDaysPanel from '../days/TripDaysPanel'
import { archiveTrip, getTrip } from './trip-service'
import './trips.css'
import './trip-lifecycle.css'

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
  const navigate = useNavigate()
  const [trip, setTrip] = useState<Trip>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [archiving, setArchiving] = useState(false)

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

  const handleArchive = async (): Promise<void> => {
    if (!trip || archiving) return
    const confirmed = window.confirm(`Archiviare “${trip.title}”? Potrai ripristinarlo in seguito.`)
    if (!confirmed) return

    setArchiving(true)
    setError('')
    try {
      await archiveTrip(trip.id)
      navigate('/archive', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile archiviare il viaggio.')
      setArchiving(false)
    }
  }

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
        <div className="trip-page-actions">
          <Link className="trip-secondary-action" to={`/trips/${trip.id}/edit`}>Modifica</Link>
          <button className="trip-archive-action" type="button" onClick={() => void handleArchive()} disabled={archiving}>
            {archiving ? 'Archivio…' : 'Archivia'}
          </button>
        </div>
      </div>

      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}

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

      <TripDaysPanel trip={trip} />

      <section className="trip-next-panel">
        <div>
          <p className="eyebrow">Prossimo livello</p>
          <h2>I blocchi del planner entreranno dentro ogni giornata.</h2>
          <p>Testi, checklist, luoghi, prenotazioni e media saranno ordinati come contenuti della pagina giornaliera.</p>
        </div>
        <span className="trip-next-mark" aria-hidden="true">02</span>
      </section>

      <Link className="trip-text-link" to="/">← Torna all’indice</Link>
    </article>
  )
}
