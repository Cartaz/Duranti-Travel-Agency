import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Trip } from '../../domain/entities'
import { useApplicationServices } from '../../ui/application-context'
import './trips.css'
import './trip-lifecycle.css'

const restoredStatusLabel: Record<NonNullable<Trip['archivedFromStatus']>, string> = {
  planned: 'Pianificato',
  ongoing: 'In corso',
  completed: 'Concluso',
}

function formatArchivedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function ArchivedTripsPage() {
  const { trips: tripApplication } = useApplicationServices()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restoringId, setRestoringId] = useState<string>()

  useEffect(() => {
    let cancelled = false
    void tripApplication.listArchivedTrips()
      .then((items) => {
        if (!cancelled) setTrips(items)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere l’archivio locale.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tripApplication])

  const handleRestore = async (trip: Trip): Promise<void> => {
    if (restoringId) return
    setRestoringId(trip.id)
    setError('')

    try {
      await tripApplication.restoreArchivedTrip(trip.id)
      setTrips((current) => current.filter((item) => item.id !== trip.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile ripristinare il viaggio.')
    } finally {
      setRestoringId(undefined)
    }
  }

  return (
    <section className="archive-page" aria-labelledby="archive-title">
      <div className="trip-page-heading archive-heading">
        <div>
          <p className="eyebrow">Biblioteca</p>
          <h1 id="archive-title">Archivio viaggi</h1>
          <p className="trip-detail-subtitle">Capitoli messi da parte, ma ancora completamente locali e recuperabili.</p>
        </div>
        <Link className="trip-secondary-action" to="/">Indice</Link>
      </div>

      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}
      {loading && <p className="trip-feedback" role="status">Apro l’archivio locale…</p>}

      {!loading && trips.length === 0 && (
        <section className="archive-empty">
          <p className="eyebrow">Archivio vuoto</p>
          <h2>Nessun capitolo è stato messo da parte.</h2>
          <p>I viaggi archiviati compariranno qui e potranno essere ripristinati senza perdere i loro dati.</p>
        </section>
      )}

      {trips.length > 0 && (
        <div className="archive-list">
          {trips.map((trip) => (
            <article className="archive-card" key={trip.id}>
              <div className="archive-card-copy">
                <p className="eyebrow">Archiviato {formatArchivedAt(trip.updatedAt)}</p>
                <h2>{trip.title}</h2>
                {trip.subtitle && <p>{trip.subtitle}</p>}
                <span>
                  Tornerà in: {trip.archivedFromStatus ? restoredStatusLabel[trip.archivedFromStatus] : 'Pianificato'}
                </span>
              </div>
              <button
                className="trip-primary-action archive-restore-button"
                type="button"
                onClick={() => void handleRestore(trip)}
                disabled={Boolean(restoringId)}
              >
                {restoringId === trip.id ? 'Ripristino…' : 'Ripristina'}
              </button>
            </article>
          ))}
        </div>
      )}

      <Link className="trip-text-link" to="/">← Torna al libro</Link>
    </section>
  )
}
