import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { EditableTripStatus, TripDraft } from '../../application/trips/trip-application'
import type { Trip } from '../../domain/entities'
import { majorAmountToMinor, minorAmountToMajor } from '../../lib/currency'
import { useApplicationServices } from '../../ui/application-context'
import './trips.css'

interface TripFormState {
  title: string
  subtitle: string
  status: EditableTripStatus
  startDate: string
  endDate: string
  summary: string
  currency: string
  budget: string
}

const emptyForm: TripFormState = {
  title: '',
  subtitle: '',
  status: 'planned',
  startDate: '',
  endDate: '',
  summary: '',
  currency: 'EUR',
  budget: '',
}

function tripToForm(trip: Trip): TripFormState {
  const currency = trip.currency ?? 'EUR'
  return {
    title: trip.title,
    subtitle: trip.subtitle ?? '',
    status: trip.status === 'archived' ? 'planned' : trip.status,
    startDate: trip.startDate ?? '',
    endDate: trip.endDate ?? '',
    summary: trip.summary ?? '',
    currency,
    budget: trip.budgetMinor === undefined ? '' : minorAmountToMajor(trip.budgetMinor, currency),
  }
}

function formToDraft(form: TripFormState): TripDraft {
  const currency = form.currency.trim().toUpperCase()
  const budgetInput = form.budget.trim()
  return {
    title: form.title,
    subtitle: form.subtitle,
    status: form.status,
    startDate: form.startDate,
    endDate: form.endDate,
    summary: form.summary,
    currency,
    budgetMinor: budgetInput ? majorAmountToMinor(budgetInput, currency) : undefined,
  }
}

export default function TripFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { trips: tripApplication } = useApplicationServices()
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
    void tripApplication.getTrip(tripId)
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
  }, [mode, tripApplication, tripId])

  const setField = <K extends keyof TripFormState>(key: K, value: TripFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const setStartDate = (value: string): void => {
    setError('')
    setForm((current) => ({
      ...current,
      startDate: value,
      endDate: value && current.endDate && current.endDate < value ? value : current.endDate,
    }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')

    try {
      const trip = mode === 'create'
        ? await tripApplication.createTrip(formToDraft(form))
        : await tripApplication.updateTrip(tripId ?? '', formToDraft(form))
      navigate(`/trips/${trip.id}`, { replace: mode === 'create' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare il viaggio.')
    } finally {
      setSaving(false)
    }
  }

  const cancelTo = mode === 'edit' && tripId ? `/trips/${tripId}` : '/'
  const hasOptionalDetails = Boolean(
    form.subtitle.trim()
      || form.summary.trim()
      || form.budget.trim()
      || form.status !== 'planned'
      || form.currency.trim().toUpperCase() !== 'EUR',
  )

  return (
    <section className="trip-editor-page" aria-labelledby="trip-editor-title">
      <div className="trip-page-heading">
        <div>
          <p className="eyebrow">{mode === 'create' ? 'Nuovo viaggio' : 'Modifica viaggio'}</p>
          <h1 id="trip-editor-title">{mode === 'create' ? 'Crea un viaggio' : 'Dettagli del viaggio'}</h1>
        </div>
        <Link className="trip-text-link" to={cancelTo}>Annulla</Link>
      </div>

      {loading ? (
        <p className="trip-feedback" role="status">Apro il viaggio…</p>
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

          <label className="trip-field">
            <span>Partenza</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setStartDate(event.target.value)}
            />
          </label>

          <label className="trip-field">
            <span>Ritorno</span>
            <input
              type="date"
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setField('endDate', event.target.value)}
            />
            {form.startDate && <small>Non può precedere la partenza. Se sposti in avanti la partenza, il ritorno viene riallineato automaticamente.</small>}
          </label>

          <details className="trip-form-optional">
            <summary>
              <span>
                <strong>Altri dettagli</strong>
                <small>Sottotitolo, stato, budget, valuta e appunti</small>
              </span>
              {hasOptionalDetails && <span className="trip-form-optional-state">Configurati</span>}
            </summary>

            <div className="trip-form-optional-grid">
              <label className="trip-field trip-field-wide">
                <span>Sottotitolo</span>
                <input
                  value={form.subtitle}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setField('subtitle', event.target.value)}
                  placeholder="Una frase per questo viaggio"
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

              <label className="trip-field trip-field-wide">
                <span>Budget del viaggio</span>
                <input
                  value={form.budget}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setField('budget', event.target.value)}
                  inputMode="decimal"
                  placeholder="Es. 1500,00"
                  autoComplete="off"
                />
              </label>

              <label className="trip-field trip-field-wide">
                <span>Appunti</span>
                <textarea
                  rows={5}
                  value={form.summary}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setField('summary', event.target.value)}
                  placeholder="Prime idee, cose da non perdere, note sul viaggio…"
                />
              </label>
            </div>
          </details>

          <div className="trip-form-actions">
            <Link className="trip-secondary-action" to={cancelTo}>Annulla</Link>
            <button className="trip-primary-action" type="submit" disabled={saving}>
              {saving ? 'Salvataggio…' : mode === 'create' ? 'Crea viaggio' : 'Salva modifiche'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
