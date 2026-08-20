import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Trip } from '../../domain/entities'
import { createTrip, getTrip, updateTrip, type EditableTripStatus, type TripDraft } from './trip-service'
import './trips.css'

interface TripFormState {
  title: string
  subtitle: string
  status: EditableTripStatus
  startDate: string
  endDate: string
  summary: string
  currency: string
}

const emptyForm: TripFormState = {
  title: '',
  subtitle: '',
  status: 'planned',
  startDate: '',
  endDate: '',
  summary: '',
  currency: 'EUR',
}

function tripToForm(trip: Trip): TripFormState {
  return {
    title: trip.title,
    subtitle: trip.subtitle ?? '',
    status: trip.status === 'archived' ? 'planned' : trip.status,
    startDate: trip.startDate ?? '',
    endDate: trip.endDate ?? '',
    summary: trip.summary ?? '',
    currency: trip.currency ?? 'EUR',
  }
}

function formToDraft(form: TripFormState): TripDraft {
  return {
    title: form.title,
    subtitle: form.subtitle,
    status: form.status,
    startDate: form.startDate,
    endDate: form.endDate,
    summary: form.summary,
    currency: form.currency,
  }
}

export default function TripFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const [form, setForm] = useState<TripFormState>(emptyForm)
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (mode !== 'edit') return
    if (!tripId) {
      setError('Identificatore del viaggio mancante.')
      setLoading(false)
      return
    }

    let cancelled = false
    void getTrip(tripId)
      .then((trip) => {
        if (cancelled) return
        if (!trip) {
          setError('Viaggio non trovato.')
          return
        }
        setForm(tripToForm(trip))
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
  }, [mode, tripId])

  const setField = <K extends keyof TripFormState>(key: K, value: TripFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')

    try {
      const trip = mode === 'create'
        ? await createTrip(formToDraft(form))
        : await updateTrip(tripId ?? '', formToDraft(form))
      navigate(`/trips/${trip.id}`, { replace: mode === 'create' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare il viaggio.')
    } finally {
      setSaving(false)
    }
  }

  const cancelTo = mode === 'edit' && tripId ? `/trips/${tripId}` : '/'

  return (
    <section className="trip-editor-page" aria-labelledby="trip-editor-title">
      <div className="trip-page-heading">
        <div>
          <p className="eyebrow">{mode === 'create' ? 'Nuovo capitolo' : 'Modifica capitolo'}</p>
          <h1 id="trip-editor-title">{mode === 'create' ? 'Crea un viaggio' : 'Dettagli del viaggio'}</h1>
        </div>
        <Link className="trip-text-link" to={cancelTo}>Annulla</Link>
      </div>

      {loading ? (
        <p className="trip-feedback" role="status">Apro il capitolo…</p>
      ) : (
        <form className="trip-form" onSubmit={submit}>
          {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}

          <label className="trip-field trip-field-wide">
            <span>Titolo *</span>
            <input
              required
              maxLength={120}
              value={form.title}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setField('title', event.target.value)}
              placeholder="Es. Tokyo — primavera"
              autoComplete="off"
            />
          </label>

          <label className="trip-field trip-field-wide">
            <span>Sottotitolo</span>
            <input
              value={form.subtitle}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setField('subtitle', event.target.value)}
              placeholder="Una frase per questo capitolo"
              autoComplete="off"
            />
          </label>

          <label className="trip-field">
            <span>Stato</span>
            <select value={form.status} onChange={(event: ChangeEvent<HTMLSelectElement>) => setField('status', event.target.value as EditableTripStatus)}>
              <option value="planned">Pianificato</option>
              <option value="ongoing">In corso</option>
              <option value="completed">Concluso</option>
            </select>
          </label>

          <label className="trip-field">
            <span>Valuta</span>
            <input
              value={form.currency}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setField('currency', event.target.value.toUpperCase())}
              maxLength={3}
              placeholder="EUR"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>

          <label className="trip-field">
            <span>Partenza</span>
            <input type="date" value={form.startDate} onChange={(event: ChangeEvent<HTMLInputElement>) => setField('startDate', event.target.value)} />
          </label>

          <label className="trip-field">
            <span>Ritorno</span>
            <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(event: ChangeEvent<HTMLInputElement>) => setField('endDate', event.target.value)} />
          </label>

          <label className="trip-field trip-field-wide">
            <span>Idea / riepilogo</span>
            <textarea
              rows={6}
              value={form.summary}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setField('summary', event.target.value)}
              placeholder="Perché vogliamo partire, cosa non vogliamo perderci, prime idee…"
            />
          </label>

          <div className="trip-form-actions">
            <Link className="trip-secondary-action" to={cancelTo}>Annulla</Link>
            <button className="trip-primary-action" type="submit" disabled={saving}>
              {saving ? 'Salvataggio…' : mode === 'create' ? 'Crea capitolo' : 'Salva modifiche'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
