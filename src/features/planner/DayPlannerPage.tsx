import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Block, Day, Place, Trip } from '../../domain/entities'
import { getTripDay } from '../days/day-service'
import ExpenseBlockEditor from '../expenses/ExpenseBlockEditor'
import { googleMapsUrlForPlace } from '../places/maps-url'
import {
  EMPTY_PLACE_DRAFT,
  getPlannerPlace,
  placeToDraft,
  savePlannerPlace,
  type PlaceDraft,
} from '../places/place-service'
import ReservationBlockEditor from '../reservations/ReservationBlockEditor'
import { getTrip } from '../trips/trip-service'
import {
  createPlannerBlock,
  deletePlannerBlock,
  listDayPlannerBlocks,
  movePlannerBlock,
  readPlannerBlockDraft,
  updatePlannerBlock,
  type ChecklistItemDraft,
  type PlannerBlockDraft,
  type PlannerBlockType,
} from './block-service'
import './planner.css'

const blockLabels: Record<PlannerBlockType, string> = {
  text: 'Testo',
  heading: 'Titolo',
  checklist: 'Checklist',
  divider: 'Separatore',
  place: 'Luogo',
  transport: 'Trasporto',
  accommodation: 'Alloggio',
  restaurant: 'Ristorante',
  activity: 'Attività',
  expense: 'Spesa',
}

type MoveDirection = 'up' | 'down'

interface PlaceFormState {
  name: string
  formattedAddress: string
  city: string
  countryCode: string
  category: string
  notes: string
  latitude: string
  longitude: string
}

function formatDayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, day))
}

function placeFormStateFromDraft(draft: PlaceDraft): PlaceFormState {
  return {
    name: draft.name,
    formattedAddress: draft.formattedAddress ?? '',
    city: draft.city ?? '',
    countryCode: draft.countryCode ?? '',
    category: draft.category ?? '',
    notes: draft.notes ?? '',
    latitude: draft.latitude === undefined ? '' : String(draft.latitude),
    longitude: draft.longitude === undefined ? '' : String(draft.longitude),
  }
}

function parseOptionalCoordinate(value: string): number | undefined {
  const cleaned = value.trim()
  if (!cleaned) return undefined
  return Number(cleaned.replace(',', '.'))
}

function placeDraftFromFormState(state: PlaceFormState): PlaceDraft {
  return {
    name: state.name,
    formattedAddress: state.formattedAddress,
    city: state.city,
    countryCode: state.countryCode,
    category: state.category,
    notes: state.notes,
    latitude: parseOptionalCoordinate(state.latitude),
    longitude: parseOptionalCoordinate(state.longitude),
  }
}

export default function DayPlannerPage() {
  const { tripId, dayId } = useParams<{ tripId: string; dayId: string }>()
  const [trip, setTrip] = useState<Trip>()
  const [day, setDay] = useState<Day>()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refreshBlocks = useCallback(async (): Promise<void> => {
    if (!tripId || !dayId) return
    setBlocks(await listDayPlannerBlocks(tripId, dayId))
  }, [dayId, tripId])

  useEffect(() => {
    if (!tripId || !dayId) {
      setError('Pagina del viaggio non valida.')
      setLoading(false)
      return
    }

    let cancelled = false
    void Promise.all([getTrip(tripId), getTripDay(tripId, dayId)])
      .then(async ([loadedTrip, loadedDay]) => {
        if (!loadedTrip || !loadedDay) throw new Error('Giornata non trovata in questo viaggio.')
        const loadedBlocks = await listDayPlannerBlocks(tripId, dayId)
        if (cancelled) return
        setTrip(loadedTrip)
        setDay(loadedDay)
        setBlocks(loadedBlocks)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile aprire il planner.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [dayId, tripId])

  const addBlock = async (type: PlannerBlockType): Promise<void> => {
    if (!tripId || !dayId || busy) return
    setBusy(true)
    setError('')
    try {
      await createPlannerBlock(tripId, dayId, type)
      await refreshBlocks()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile aggiungere il blocco.')
    } finally {
      setBusy(false)
    }
  }

  if (!tripId || !dayId) return <p className="trip-feedback trip-feedback-error">Pagina non valida.</p>
  if (loading) return <p className="trip-feedback" role="status">Apro il planner locale…</p>
  if (!trip || !day) {
    return (
      <section className="planner-page">
        <p className="trip-feedback trip-feedback-error" role="alert">{error || 'Giornata non trovata.'}</p>
        <Link className="trip-text-link" to={`/trips/${tripId}`}>← Torna al viaggio</Link>
      </section>
    )
  }

  const readOnly = trip.status === 'archived'

  return (
    <section className="planner-page" aria-labelledby="planner-title">
      <header className="planner-heading">
        <div>
          <p className="eyebrow">Pagina {String(day.sequence).padStart(2, '0')}</p>
          <h1 id="planner-title">{day.title ?? `Giorno ${day.sequence}`}</h1>
          <p className="planner-date">{formatDayDate(day.date)} · {trip.title}</p>
          {day.summary && <p className="planner-summary">{day.summary}</p>}
        </div>
        <div className="planner-heading-actions">
          {!readOnly && <Link className="trip-secondary-action" to={`/trips/${trip.id}/days/${day.id}/edit`}>Modifica giornata</Link>}
          <Link className="trip-secondary-action" to={`/trips/${trip.id}`}>Torna al capitolo</Link>
        </div>
      </header>

      {readOnly && (
        <p className="planner-readonly" role="status">Il viaggio è archiviato: la pagina resta leggibile ma non modificabile.</p>
      )}
      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}

      {!readOnly && (
        <section className="planner-toolbar" aria-label="Aggiungi blocco">
          <div>
            <p className="eyebrow">Nuovo blocco</p>
            <strong>Costruisci la giornata un pezzo alla volta</strong>
          </div>
          <div className="planner-toolbar-actions">
            {(Object.keys(blockLabels) as PlannerBlockType[]).map((type) => (
              <button type="button" key={type} disabled={busy} onClick={() => void addBlock(type)}>
                + {blockLabels[type]}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="planner-canvas" aria-label="Blocchi della giornata">
        {blocks.length === 0 && (
          <div className="planner-empty">
            <strong>Questa pagina è ancora bianca.</strong>
            <span>Aggiungi testo, luoghi, trasporti, alloggi, ristoranti, attività, spese o checklist.</span>
          </div>
        )}

        {blocks.map((block, index) => (
          <PlannerBlockEditor
            key={block.id}
            block={block}
            tripId={trip.id}
            dayId={day.id}
            dayDate={day.date}
            tripEndDate={trip.endDate}
            tripCurrency={trip.currency}
            readOnly={readOnly}
            canMoveUp={index > 0}
            canMoveDown={index < blocks.length - 1}
            onChanged={refreshBlocks}
          />
        ))}
      </section>
    </section>
  )
}

interface PlannerBlockEditorProps {
  block: Block
  tripId: string
  dayId: string
  dayDate: string
  tripEndDate?: string
  tripCurrency?: string
  readOnly: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onChanged: () => Promise<void>
}

function PlannerBlockEditor(props: PlannerBlockEditorProps) {
  if (props.block.type === 'expense') return <ExpenseBlockEditor {...props} />
  if (
    props.block.type === 'transport'
    || props.block.type === 'accommodation'
    || props.block.type === 'restaurant'
    || props.block.type === 'activity'
  ) {
    return <ReservationBlockEditor {...props} />
  }
  if (props.block.type === 'place') return <PlannerPlaceBlockEditor {...props} />
  return <PlannerBasicBlockEditor {...props} />
}

function PlannerBasicBlockEditor({
  block,
  tripId,
  dayId,
  readOnly,
  canMoveUp,
  canMoveDown,
  onChanged,
}: PlannerBlockEditorProps) {
  const [draft, setDraft] = useState<PlannerBlockDraft>(() => readPlannerBlockDraft(block))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(readPlannerBlockDraft(block))
  }, [block])

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (readOnly || saving) return
    setSaving(true)
    setError('')
    try {
      await updatePlannerBlock(tripId, dayId, block.id, draft)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare il blocco.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (readOnly || saving || !window.confirm('Eliminare questo blocco dalla giornata?')) return
    setSaving(true)
    setError('')
    try {
      await deletePlannerBlock(tripId, dayId, block.id)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile eliminare il blocco.')
      setSaving(false)
    }
  }

  const move = async (direction: MoveDirection): Promise<void> => {
    if (readOnly || saving) return
    setSaving(true)
    setError('')
    try {
      await movePlannerBlock(tripId, dayId, block.id, direction)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile spostare il blocco.')
    } finally {
      setSaving(false)
    }
  }

  const tools = (
    <PlannerBlockTools
      readOnly={readOnly}
      saving={saving}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onMove={move}
      onRemove={remove}
    />
  )

  if (draft.type === 'divider') {
    return (
      <article className="planner-block planner-divider-block">
        <div className="planner-block-topline">
          <span>{blockLabels.divider}</span>
          {tools}
        </div>
        <hr />
        {error && <small className="planner-block-error">{error}</small>}
      </article>
    )
  }

  return (
    <form className={`planner-block planner-block-${draft.type}`} onSubmit={(event) => void save(event)}>
      <div className="planner-block-topline">
        <span>{blockLabels[draft.type]}</span>
        {tools}
      </div>

      {draft.type === 'text' && (
        <textarea
          rows={6}
          maxLength={10_000}
          readOnly={readOnly}
          placeholder="Scrivi appunti, idee, dettagli della giornata…"
          value={draft.text}
          onChange={(event) => setDraft({ type: 'text', text: event.target.value })}
        />
      )}

      {draft.type === 'heading' && (
        <input
          maxLength={200}
          readOnly={readOnly}
          placeholder="Titolo della sezione"
          value={draft.text}
          onChange={(event) => setDraft({ type: 'heading', text: event.target.value })}
        />
      )}

      {draft.type === 'checklist' && (
        <ChecklistEditor items={draft.items} readOnly={readOnly} onChange={(items) => setDraft({ type: 'checklist', items })} />
      )}

      {error && <small className="planner-block-error">{error}</small>}
      {!readOnly && (
        <div className="planner-block-actions">
          <button type="submit" disabled={saving}>{saving ? 'Salvataggio…' : 'Salva blocco'}</button>
        </div>
      )}
    </form>
  )
}

function PlannerPlaceBlockEditor({
  block,
  tripId,
  dayId,
  readOnly,
  canMoveUp,
  canMoveDown,
  onChanged,
}: PlannerBlockEditorProps) {
  const [place, setPlace] = useState<Place>()
  const [state, setState] = useState<PlaceFormState>(() => placeFormStateFromDraft(EMPTY_PLACE_DRAFT))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getPlannerPlace(tripId, dayId, block.id)
      .then((loadedPlace) => {
        if (cancelled) return
        setPlace(loadedPlace)
        setState(placeFormStateFromDraft(loadedPlace ? placeToDraft(loadedPlace) : EMPTY_PLACE_DRAFT))
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere il luogo.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [block.id, block.updatedAt, dayId, tripId])

  const patch = (changes: Partial<PlaceFormState>): void => setState((current) => ({ ...current, ...changes }))

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (readOnly || saving) return
    setSaving(true)
    setError('')
    try {
      const saved = await savePlannerPlace(tripId, dayId, block.id, placeDraftFromFormState(state))
      setPlace(saved)
      setState(placeFormStateFromDraft(placeToDraft(saved)))
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare il luogo.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (readOnly || saving || !window.confirm('Rimuovere questo luogo dalla giornata? Il luogo salvato resterà disponibile per funzioni future.')) return
    setSaving(true)
    setError('')
    try {
      await deletePlannerBlock(tripId, dayId, block.id)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile rimuovere il luogo.')
      setSaving(false)
    }
  }

  const move = async (direction: MoveDirection): Promise<void> => {
    if (readOnly || saving) return
    setSaving(true)
    setError('')
    try {
      await movePlannerBlock(tripId, dayId, block.id, direction)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile spostare il luogo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="planner-block planner-place-block" onSubmit={(event) => void save(event)}>
      <div className="planner-block-topline">
        <span>{blockLabels.place}</span>
        <PlannerBlockTools
          readOnly={readOnly}
          saving={saving}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMove={move}
          onRemove={remove}
        />
      </div>

      {loading ? (
        <span className="planner-place-loading" role="status">Carico il luogo…</span>
      ) : (
        <>
          <div className="planner-place-grid">
            <label className="planner-place-wide">
              <span>Nome *</span>
              <input type="text" maxLength={200} required readOnly={readOnly} placeholder="Musei Vaticani" value={state.name} onChange={(event) => patch({ name: event.target.value })} />
            </label>
            <label className="planner-place-wide">
              <span>Indirizzo</span>
              <input type="text" maxLength={500} readOnly={readOnly} placeholder="Viale Vaticano, Roma" value={state.formattedAddress} onChange={(event) => patch({ formattedAddress: event.target.value })} />
            </label>
            <label>
              <span>Città</span>
              <input type="text" maxLength={120} readOnly={readOnly} placeholder="Roma" value={state.city} onChange={(event) => patch({ city: event.target.value })} />
            </label>
            <label>
              <span>Paese</span>
              <input type="text" maxLength={2} autoCapitalize="characters" readOnly={readOnly} placeholder="IT" value={state.countryCode} onChange={(event) => patch({ countryCode: event.target.value.toUpperCase() })} />
            </label>
            <label>
              <span>Categoria</span>
              <input type="text" maxLength={80} readOnly={readOnly} placeholder="Museo" value={state.category} onChange={(event) => patch({ category: event.target.value })} />
            </label>
            <label>
              <span>Latitudine</span>
              <input type="text" inputMode="decimal" readOnly={readOnly} placeholder="41.9065" value={state.latitude} onChange={(event) => patch({ latitude: event.target.value })} />
            </label>
            <label>
              <span>Longitudine</span>
              <input type="text" inputMode="decimal" readOnly={readOnly} placeholder="12.4536" value={state.longitude} onChange={(event) => patch({ longitude: event.target.value })} />
            </label>
            <label className="planner-place-wide">
              <span>Note</span>
              <textarea rows={4} maxLength={2000} readOnly={readOnly} placeholder="Orari, biglietti, cosa vogliamo vedere…" value={state.notes} onChange={(event) => patch({ notes: event.target.value })} />
            </label>
          </div>

          {error && <small className="planner-block-error">{error}</small>}
          <div className="planner-place-actions">
            {place && (
              <a className="planner-map-link" href={googleMapsUrlForPlace(place)} target="_blank" rel="noreferrer">
                Apri in Google Maps ↗
              </a>
            )}
            {!readOnly && <button type="submit" disabled={saving}>{saving ? 'Salvataggio…' : place ? 'Salva luogo' : 'Crea luogo'}</button>}
          </div>
        </>
      )}
    </form>
  )
}

function PlannerBlockTools({
  readOnly,
  saving,
  canMoveUp,
  canMoveDown,
  onMove,
  onRemove,
}: {
  readOnly: boolean
  saving: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (direction: MoveDirection) => Promise<void>
  onRemove: () => Promise<void>
}) {
  if (readOnly) return null

  return (
    <div className="planner-block-tools">
      <button type="button" disabled={saving || !canMoveUp} aria-label="Sposta blocco su" title="Sposta su" onClick={() => void onMove('up')}>↑</button>
      <button type="button" disabled={saving || !canMoveDown} aria-label="Sposta blocco giù" title="Sposta giù" onClick={() => void onMove('down')}>↓</button>
      <button className="planner-delete" type="button" disabled={saving} onClick={() => void onRemove()}>Elimina</button>
    </div>
  )
}

function ChecklistEditor({
  items,
  readOnly,
  onChange,
}: {
  items: ChecklistItemDraft[]
  readOnly: boolean
  onChange: (items: ChecklistItemDraft[]) => void
}) {
  const patch = (id: string, changes: Partial<ChecklistItemDraft>): void => {
    onChange(items.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  return (
    <div className="planner-checklist">
      {items.length === 0 && <span className="planner-checklist-empty">Nessuna voce. Aggiungi il primo elemento.</span>}
      {items.map((item) => (
        <div className="planner-checklist-row" key={item.id}>
          <input
            type="checkbox"
            checked={item.checked}
            disabled={readOnly}
            aria-label={`Completa ${item.text || 'voce checklist'}`}
            onChange={(event) => patch(item.id, { checked: event.target.checked })}
          />
          <input
            type="text"
            maxLength={500}
            readOnly={readOnly}
            placeholder="Voce checklist"
            value={item.text}
            onChange={(event) => patch(item.id, { text: event.target.value })}
          />
          {!readOnly && (
            <button type="button" aria-label="Rimuovi voce" onClick={() => onChange(items.filter((candidate) => candidate.id !== item.id))}>×</button>
          )}
        </div>
      ))}
      {!readOnly && items.length < 100 && (
        <button
          className="planner-add-check"
          type="button"
          onClick={() => onChange([...items, { id: crypto.randomUUID(), text: '', checked: false }])}
        >
          + Aggiungi voce
        </button>
      )}
    </div>
  )
}
