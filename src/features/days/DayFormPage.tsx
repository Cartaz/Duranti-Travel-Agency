import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Template } from '../../domain/entities'
import { createTripDay, getTripDay, updateTripDay, type DayDraft } from './day-service'
import { createTripDayFromTemplate, listDayTemplates } from '../templates/day-template-service'
import { getTrip } from '../trips/trip-service'
import './days.css'

function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function rangeHint(startDate?: string, endDate?: string): string | undefined {
  if (startDate && endDate && startDate === endDate) {
    return `Per questo viaggio la giornata deve essere il ${formatDisplayDate(startDate)}.`
  }
  if (startDate && endDate) {
    return `Scegli una data dal ${formatDisplayDate(startDate)} al ${formatDisplayDate(endDate)}.`
  }
  if (startDate) return `La giornata non può precedere ${formatDisplayDate(startDate)}.`
  if (endDate) return `La giornata non può superare ${formatDisplayDate(endDate)}.`
  return undefined
}

export default function DayFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { tripId, dayId } = useParams<{ tripId: string; dayId: string }>()
  const navigate = useNavigate()
  const [tripTitle, setTripTitle] = useState('')
  const [tripRange, setTripRange] = useState<{ startDate?: string; endDate?: string }>({})
  const [draft, setDraft] = useState<DayDraft>({ date: '', title: '', summary: '', journalText: '' })
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState('')
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
    void Promise.all([
      getTrip(tripId),
      mode === 'create' ? listDayTemplates() : Promise.resolve([]),
    ])
      .then(async ([trip, availableTemplates]) => {
        if (!trip || trip.status === 'archived') throw new Error('Viaggio non disponibile per la modifica.')
        if (cancelled) return
        setTripTitle(trip.title)
        setTripRange({ startDate: trip.startDate, endDate: trip.endDate })
        setTemplates(availableTemplates)

        if (mode === 'edit') {
          if (!dayId) throw new Error('Identificatore della giornata mancante.')
          const day = await getTripDay(tripId, dayId)
          if (!day) throw new Error('Giornata non trovata in questo viaggio.')
          if (cancelled) return
          setDraft({
            date: day.date,
            title: day.title ?? '',
            summary: day.summary ?? '',
            journalText: day.journalText ?? '',
          })
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
        const createdDay = templateId
          ? await createTripDayFromTemplate(tripId, draft, templateId)
          : await createTripDay(tripId, draft)
        navigate(templateId ? `/trips/${tripId}/days/${createdDay.id}` : `/trips/${tripId}`, { replace: true })
      } else {
        if (!dayId) throw new Error('Identificatore della giornata mancante.')
        await updateTripDay(tripId, dayId, draft)
        navigate(`/trips/${tripId}`, { replace: true })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare la giornata.')
      setSaving(false)
    }
  }

  if (!tripId) return <p className="trip-feedback trip-feedback-error">Viaggio non valido.</p>
  if (loading) return <p className="trip-feedback" role="status">Preparo la pagina…</p>

  const dateHint = rangeHint(tripRange.startDate, tripRange.endDate)
  const hasJournal = Boolean(draft.journalText?.trim())

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
          <span>Data della giornata *</span>
          <input
            type="date"
            required
            min={tripRange.startDate}
            max={tripRange.endDate}
            disabled={!contextReady}
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          />
          {dateHint && <small>{dateHint}</small>}
        </label>

        {mode === 'create' && (
          <section className="day-template-picker" aria-labelledby="day-template-title">
            <div className="day-template-heading">
              <div>
                <span className="eyebrow">Struttura iniziale</span>
                <strong id="day-template-title">Come vuoi iniziare?</strong>
              </div>
              <small>Puoi modificare, spostare o eliminare tutti i blocchi dopo la creazione.</small>
            </div>
            <div className="day-template-grid">
              <button
                className={`day-template-option${!templateId ? ' day-template-option-selected' : ''}`}
                type="button"
                aria-pressed={!templateId}
                disabled={!contextReady || saving}
                onClick={() => setTemplateId('')}
              >
                <strong>Pagina vuota</strong>
                <span>Inizia senza blocchi precompilati.</span>
              </button>
              {templates.map((template) => (
                <button
                  className={`day-template-option${templateId === template.id ? ' day-template-option-selected' : ''}`}
                  type="button"
                  key={template.id}
                  aria-pressed={templateId === template.id}
                  disabled={!contextReady || saving}
                  onClick={() => setTemplateId(template.id)}
                >
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <label>
          <span>Titolo della giornata</span>
          <input maxLength={120} disabled={!contextReady} placeholder="Musei e passeggiata in centro" value={draft.title ?? ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label>
          <span>Riepilogo</span>
          <textarea maxLength={2000} rows={5} disabled={!contextReady} placeholder="In poche righe: cosa è previsto o cosa ha caratterizzato la giornata…" value={draft.summary ?? ''} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
          <small>Usa il riepilogo per una sintesi breve. Il racconto completo può stare nel diario.</small>
        </label>

        <details className="day-journal-details">
          <summary>
            <span>
              <strong>Diario della giornata</strong>
              <small>Ricordi, impressioni, incontri e dettagli da conservare</small>
            </span>
            {hasJournal && <span className="day-journal-state">Scritto</span>}
          </summary>
          <label className="day-journal-field">
            <span>Il racconto</span>
            <textarea
              maxLength={20_000}
              rows={12}
              disabled={!contextReady}
              placeholder="Com'è andata davvero? Cosa ti ha sorpreso, cosa vuoi ricordare, quali momenti meritano di restare…"
              value={draft.journalText ?? ''}
              onChange={(event) => setDraft({ ...draft, journalText: event.target.value })}
            />
            <small>{(draft.journalText ?? '').length.toLocaleString('it-IT')} / 20.000 caratteri</small>
          </label>
        </details>

        <div className="day-form-actions">
          <button className="trip-primary-action" type="submit" disabled={saving || !contextReady}>
            {saving ? 'Salvataggio…' : mode === 'create' ? (templateId ? 'Crea e apri giornata' : 'Crea giornata') : 'Salva giornata'}
          </button>
        </div>
      </form>
    </section>
  )
}
