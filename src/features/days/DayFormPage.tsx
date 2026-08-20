import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createTripDay, getTripDay, updateTripDay, type DayDraft } from './day-service'
import { getTrip } from '../trips/trip-service'
import './days.css'

export default function DayFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { tripId, dayId } = useParams<{ tripId: string; dayId: string }>()
  const navigate = useNavigate()
  const [tripTitle, setTripTitle] = useState('')
  const [tripRange, setTripRange] = useState<{ startDate?: string; endDate?: string }>({})
  const [draft, setDraft] = useState<DayDraft>({ date: '', title: '', summary: '' })
  const [loading, setLoading] = useState(true)
  const [contextReady, setContextReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tripId) {
      setError('Identificatore del viaggio mancante.')
      setLoading(false)
      return
    }

    let cancelled = false
    void getTrip(tripId)
      .then(async (trip) => {
        if (!trip || trip.status === 'archived') throw new Error('Viaggio non disponibile per la modifica.')
        if (cancelled) return
        setTripTitle(trip.title)
        setTripRange({ startDate: trip.startDate, endDate: trip.endDate })

        if (mode === 'edit') {
          if (!dayId) throw new Error('Identificatore della giornata mancante.')
          const day = await getTripDay(tripId, dayId)
          if (!day) throw new Error('Giornata non trovata in questo viaggio.')
          if (cancelled) return
          setDraft({ date: day.date, title: day.title ?? '', summary: day.summary ?? '' })
        } else if (trip.startDate) {
          setDraft((current) => ({ ...current, date: trip.startDate ?? '' }))
        }

        if (!cancelled) setContextReady(true)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile preparare la giornata.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [dayId, mode, tripId])

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!tripId || !contextReady || saving) return

    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        await createTripDay(tripId, draft)
      } else {
        if (!dayId) throw new Error('Identificatore della giornata mancante.')
        await updateTripDay(tripId, dayId, draft)
      }
      navigate(`/trips/${tripId}`, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare la giornata.')
      setSaving(false)
    }
  }

  if (!tripId) return <p className="trip-feedback trip-feedback-error">Viaggio non valido.</p>
  if (loading) return <p className="trip-feedback" role="status">Preparo la pagina…</p>

  return (
    <section className="day-form-page" aria-labelledby="day-form-title">
      <div className="trip-page-heading">
        <div>
          <p className="eyebrow">{mode === 'create' ? 'Nuova pagina' : 'Modifica pagina'}</p>
          <h1 id="day-form-title">{mode === 'create' ? 'Nuova giornata' : 'Giornata del viaggio'}</h1>
          {tripTitle && <p className="trip-detail-subtitle">{tripTitle}</p>}
        </div>
        <Link className="trip-secondary-action" to={`/trips/${tripId}`}>Annulla</Link>
      </div>

      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}

      <form className="day-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>Data</span>
          <input
            type="date"
            required
            min={tripRange.startDate}
            max={tripRange.endDate}
            disabled={!contextReady}
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          />
          {(tripRange.startDate || tripRange.endDate) && (
            <small>
              {tripRange.startDate && tripRange.endDate
                ? `La giornata deve essere compresa tra ${tripRange.startDate} e ${tripRange.endDate}.`
                : tripRange.startDate
                  ? `La giornata non può precedere ${tripRange.startDate}.`
                  : `La giornata non può superare ${tripRange.endDate}.`}
            </small>
          )}
        </label>
        <label>
          <span>Titolo della giornata</span>
          <input maxLength={120} disabled={!contextReady} placeholder="Musei e passeggiata in centro" value={draft.title ?? ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label>
          <span>Riepilogo</span>
          <textarea maxLength={2000} rows={7} disabled={!contextReady} placeholder="Cosa vogliamo fare, vedere o ricordare…" value={draft.summary ?? ''} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
        </label>
        <div className="day-form-actions">
          <button className="trip-primary-action" type="submit" disabled={saving || !contextReady}>
            {saving ? 'Salvataggio…' : mode === 'create' ? 'Crea giornata' : 'Salva giornata'}
          </button>
        </div>
      </form>
    </section>
  )
}
