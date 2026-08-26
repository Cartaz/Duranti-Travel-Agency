import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { EditableTripStatus } from '../../application/trips/trip-application'
import type { Trip } from '../../domain/entities'
import InlineConfirm from '../../ui/InlineConfirm'
import { useApplicationServices } from '../../ui/application-context'
import TripDaysPanel from '../days/TripDaysPanel'
import TripExpenseSummary from '../expenses/TripExpenseSummary'
import TripItineraryOverview from '../itinerary/TripItineraryOverview'
import TripTravelersPanel from '../travelers/TripTravelersPanel'
import './trips.css'
import './trip-lifecycle.css'
import './trip-detail-simple.css'

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

function lifecycleAction(status: EditableTripStatus): { target: EditableTripStatus; label: string } | undefined {
  if (status === 'planned') return { target: 'ongoing', label: 'Inizia viaggio' }
  if (status === 'ongoing') return { target: 'completed', label: 'Segna concluso' }
  if (status === 'completed') return { target: 'ongoing', label: 'Riapri viaggio' }
  return undefined
}

export default function TripDetailPage() {
  const { trips: tripApplication } = useApplicationServices()
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const [trip, setTrip] = useState<Trip>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    if (!tripId) {
      setError('Identificatore del viaggio mancante.')
      setLoading(false)
      return
    }

    let cancelled = false
    void tripApplication.getTrip(tripId)
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
  }, [tripApplication, tripId])

  const handleArchive = async (): Promise<void> => {
    if (!trip || archiving) return

    setArchiving(true)
    setError('')
    try {
      await tripApplication.archiveTrip(trip.id)
      navigate('/archive', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile archiviare il viaggio.')
      setArchiving(false)
      setConfirmArchive(false)
    }
  }

  const handleStatusChange = async (status: EditableTripStatus): Promise<void> => {
    if (!trip || statusBusy) return
    setStatusBusy(true)
    setError('')
    try {
      const updated = await tripApplication.setTripStatus(trip.id, status)
      setTrip(updated)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile aggiornare lo stato del viaggio.')
    } finally {
      setStatusBusy(false)
    }
  }

  if (loading) return <p className="trip-feedback" role="status">Apro il viaggio…</p>

  if (!trip || trip.status === 'archived') {
    return (
      <section className="trip-detail-page">
        <p className="trip-feedback trip-feedback-error" role="alert">{error || 'Viaggio non trovato.'}</p>
        <Link className="trip-text-link" to="/">Torna ai viaggi</Link>
      </section>
    )
  }

  const nextLifecycleAction = lifecycleAction(trip.status)

  return (
    <article className="trip-detail-page" aria-labelledby="trip-detail-title">
      <div className="trip-page-heading">
        <div>
          <p className="eyebrow">Viaggio</p>
          <h1 id="trip-detail-title">{trip.title}</h1>
          {trip.subtitle && <p className="trip-detail-subtitle">{trip.subtitle}</p>}
        </div>
        <div className="trip-page-actions">
          <Link className="trip-secondary-action" to={`/trips/${trip.id}/edit`}>Modifica</Link>
          <button className="trip-archive-action" type="button" onClick={() => setConfirmArchive(true)} disabled={archiving || statusBusy}>
            {archiving ? 'Archivio…' : 'Archivia'}
          </button>
        </div>
      </div>

      {confirmArchive && (
        <InlineConfirm
          title={`Archiviare “${trip.title}”?`}
          message="Il viaggio verrà spostato nell’archivio e resterà ripristinabile. I suoi dati non vengono eliminati."
          confirmLabel="Archivia viaggio"
          busy={archiving}
          onConfirm={() => void handleArchive()}
          onCancel={() => setConfirmArchive(false)}
        />
      )}

      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}

      <div className="trip-detail-grid trip-detail-grid-essential">
        <section className="trip-detail-panel">
          <p className="eyebrow">Stato</p>
          <strong>{statusLabel[trip.status]}</strong>
          {nextLifecycleAction && (
            <button
              className="trip-secondary-action trip-status-action"
              type="button"
              disabled={statusBusy || archiving}
              onClick={() => void handleStatusChange(nextLifecycleAction.target)}
            >
              {statusBusy ? 'Aggiorno…' : nextLifecycleAction.label}
            </button>
          )}
        </section>
        <section className="trip-detail-panel">
          <p className="eyebrow">Partenza</p>
          <strong>{formatDate(trip.startDate)}</strong>
        </section>
        <section className="trip-detail-panel">
          <p className="eyebrow">Ritorno</p>
          <strong>{formatDate(trip.endDate)}</strong>
        </section>
      </div>

      <TripDaysPanel trip={trip} />

      <details className="trip-progressive-section">
        <summary>
          <span>
            <strong>Itinerario completo</strong>
            <small>Vedi tutte le tappe del viaggio in sequenza</small>
          </span>
        </summary>
        <TripItineraryOverview tripId={trip.id} />
      </details>

      <details className="trip-progressive-section">
        <summary>
          <span>
            <strong>Dettagli e organizzazione</strong>
            <small>Partecipanti, budget, valuta e appunti</small>
          </span>
        </summary>
        <div className="trip-progressive-content">
          <section className="trip-summary-panel">
            <p className="eyebrow">Appunti</p>
            <p>{trip.summary ?? 'Nessun appunto ancora.'}</p>
          </section>
          <section className="trip-detail-panel trip-currency-panel">
            <p className="eyebrow">Valuta</p>
            <strong>{trip.currency ?? 'Da definire'}</strong>
          </section>
          <TripTravelersPanel tripId={trip.id} />
          <TripExpenseSummary tripId={trip.id} />
        </div>
      </details>

      <Link className="trip-text-link" to="/">← Torna ai viaggi</Link>
    </article>
  )
}
