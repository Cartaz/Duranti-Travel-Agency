import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Trip, TripStatus } from '../../domain/entities'
import { listBookTrips } from './trip-service'
import './trips.css'
import './trip-lifecycle.css'

const chapters: Array<{
  key: Extract<TripStatus, 'planned' | 'ongoing' | 'completed'>
  eyebrow: string
  title: string
  description: string
}> = [
  {
    key: 'planned',
    eyebrow: 'Capitoli da scrivere',
    title: 'Viaggi pianificati',
    description: 'Idee, date, luoghi e prenotazioni prendono forma qui.',
  },
  {
    key: 'ongoing',
    eyebrow: 'Adesso',
    title: 'Viaggi in corso',
    description: 'Il capitolo aperto durante il viaggio, sempre disponibile offline.',
  },
  {
    key: 'completed',
    eyebrow: 'Memorie',
    title: 'Viaggi conclusi',
    description: 'Diari, fotografie e ricordi da rileggere come pagine di un libro.',
  },
]

function formatTripDates(trip: Trip): string {
  const format = (value: string): string => {
    const [year, month, day] = value.split('-').map(Number)
    if (!year || !month || !day) return value
    return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(year, month - 1, day))
  }

  if (trip.startDate && trip.endDate) return `${format(trip.startDate)} — ${format(trip.endDate)}`
  if (trip.startDate) return `dal ${format(trip.startDate)}`
  if (trip.endDate) return `fino al ${format(trip.endDate)}`
  return 'Date da definire'
}

export default function TravelIndexPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void listBookTrips()
      .then((items) => {
        if (!cancelled) setTrips(items)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere i viaggi locali.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const groups = useMemo(() => {
    return new Map(chapters.map((chapter) => [
      chapter.key,
      trips.filter((trip) => trip.status === chapter.key),
    ]))
  }, [trips])

  return (
    <section className="travel-index" aria-labelledby="travel-index-title">
      <div className="book-intro">
        <div className="book-intro-copy">
          <p className="eyebrow">DURANTI TRAVEL AGENCY</p>
          <h1 id="travel-index-title">Il nostro libro dei viaggi</h1>
          <p className="book-tagline">viaggia con noi, viaggio, con i topi</p>
          <p className="book-intro-note">
            Un unico libro. Ogni viaggio è un capitolo da pianificare, vivere e conservare.
          </p>
        </div>
        <div className="book-intro-actions">
          <div className="trip-index-actions">
            <Link className="trip-secondary-action" to="/travelers">Viaggiatori</Link>
            <Link className="trip-secondary-action" to="/archive">Archivio</Link>
            <Link className="trip-primary-action" to="/trips/new">Nuovo viaggio</Link>
          </div>
          <div className="book-emblem" aria-hidden="true">
            <span>DTA</span>
            <small>EST. NOI DUE</small>
          </div>
        </div>
      </div>

      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}
      {loading && <p className="trip-feedback" role="status">Apro l’indice locale…</p>}

      <div className="chapter-list" aria-label="Indice dei viaggi">
        {chapters.map((chapter, index) => {
          const chapterTrips = groups.get(chapter.key) ?? []
          return (
            <article className="chapter-card chapter-card-live" key={chapter.key}>
              <div className="chapter-heading-row">
                <div className="chapter-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="chapter-copy">
                  <p className="eyebrow">{chapter.eyebrow}</p>
                  <h2>{chapter.title}</h2>
                  <p>{chapter.description}</p>
                </div>
                <div className="chapter-count" aria-label={`${chapterTrips.length} viaggi`}>
                  {chapterTrips.length}
                </div>
              </div>

              {!loading && chapterTrips.length === 0 && (
                <p className="chapter-empty">Nessun capitolo in questa sezione.</p>
              )}

              {chapterTrips.length > 0 && (
                <div className="trip-card-list">
                  {chapterTrips.map((trip) => (
                    <Link className="trip-card" to={`/trips/${trip.id}`} key={trip.id}>
                      <div>
                        <strong>{trip.title}</strong>
                        {trip.subtitle && <span>{trip.subtitle}</span>}
                      </div>
                      <div className="trip-card-meta">
                        <span>{formatTripDates(trip)}</span>
                        <span aria-hidden="true">›</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <aside className="foundation-note">
        <span className="foundation-dot" aria-hidden="true" />
        <p>Dati, media, documenti cifrati e Vault restano locali sul dispositivo.</p>
      </aside>
    </section>
  )
}
