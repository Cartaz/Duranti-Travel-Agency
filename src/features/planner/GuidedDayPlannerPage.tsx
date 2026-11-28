import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { PlannerBlockType } from '../../application/planner/planner-application'
import { useApplicationServices } from '../../ui/application-context'
import DayMediaGallery from '../media/DayMediaGallery'
import DayTemplateSaver from '../templates/DayTemplateSaver'
import DayPlannerPage, { type DayPlannerHandle } from './DayPlannerPage'
import './planner-quick-add.css'

interface AddChoice {
  type: PlannerBlockType
  label: string
  hint: string
}

const primaryChoices: AddChoice[] = [
  { type: 'transport', label: 'Spostamento', hint: 'Volo, treno, auto o trasferimento' },
  { type: 'activity', label: 'Attività', hint: 'Visita, museo, escursione o esperienza' },
  { type: 'restaurant', label: 'Mangiare', hint: 'Pranzo, cena o prenotazione' },
  { type: 'accommodation', label: 'Dormire', hint: 'Hotel, appartamento o altro alloggio' },
]

const secondaryChoices: AddChoice[] = [
  { type: 'place', label: 'Luogo', hint: 'Un posto da ricordare' },
  { type: 'expense', label: 'Spesa', hint: 'Un costo della giornata' },
  { type: 'text', label: 'Appunti', hint: 'Testo libero' },
  { type: 'checklist', label: 'Checklist', hint: 'Cose da fare o portare' },
  { type: 'heading', label: 'Titolo sezione', hint: 'Organizza la pagina' },
  { type: 'divider', label: 'Separatore', hint: 'Dividi visivamente i contenuti' },
]

function choiceLabel(type: PlannerBlockType): string {
  return [...primaryChoices, ...secondaryChoices].find((choice) => choice.type === type)?.label ?? 'elemento'
}

export default function GuidedDayPlannerPage() {
  const { tripId, dayId } = useParams<{ tripId: string; dayId: string }>()
  const { trips: tripApplication } = useApplicationServices('trips')
  const [busyType, setBusyType] = useState<PlannerBlockType>()
  const [canEdit, setCanEdit] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const plannerRef = useRef<DayPlannerHandle>(null)

  useEffect(() => {
    if (!tripId) {
      setCanEdit(false)
      return
    }

    let cancelled = false
    void tripApplication
      .getTrip(tripId)
      .then((trip) => {
        if (!cancelled) setCanEdit(Boolean(trip && trip.status !== 'archived'))
      })
      .catch(() => {
        if (!cancelled) setCanEdit(false)
      })

    return () => {
      cancelled = true
    }
  }, [tripApplication, tripId])

  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(''), 3500)
    return () => window.clearTimeout(timer)
  }, [status])

  const add = async (type: PlannerBlockType): Promise<void> => {
    if (!tripId || !dayId || busyType) return
    setBusyType(type)
    setError('')
    setStatus('')

    try {
      if (!plannerRef.current) throw new Error('Il planner della giornata non è ancora pronto.')
      await plannerRef.current.addBlock(type)
      setStatus(`${choiceLabel(type)} aggiunto. Compila i dettagli nel nuovo blocco.`)
      if (detailsRef.current) detailsRef.current.open = false
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile aggiungere questo elemento alla giornata.')
    } finally {
      setBusyType(undefined)
    }
  }

  return (
    <div className="guided-day-planner">
      <DayPlannerPage ref={plannerRef} showToolbar={false} />

      {tripId && dayId && <DayMediaGallery tripId={tripId} dayId={dayId} readOnly={!canEdit} />}

      {canEdit && (
        <details className="planner-quick-add" ref={detailsRef}>
          <summary>+ Aggiungi alla giornata</summary>
          <div className="planner-quick-add-panel">
            <div className="planner-quick-add-heading">
              <strong>Cosa vuoi aggiungere?</strong>
              <span>Scegli per intenzione. I dettagli si compilano dopo.</span>
            </div>

            {error && (
              <p className="planner-quick-add-error" role="alert">
                {error}
              </p>
            )}

            <div className="planner-quick-add-primary">
              {primaryChoices.map((choice) => (
                <button
                  type="button"
                  key={choice.type}
                  disabled={Boolean(busyType)}
                  onClick={() => void add(choice.type)}
                >
                  <strong>{busyType === choice.type ? 'Aggiungo…' : choice.label}</strong>
                  <span>{choice.hint}</span>
                </button>
              ))}
            </div>

            <details className="planner-quick-add-more">
              <summary>Altre opzioni</summary>
              <div className="planner-quick-add-secondary">
                {secondaryChoices.map((choice) => (
                  <button
                    type="button"
                    key={choice.type}
                    disabled={Boolean(busyType)}
                    onClick={() => void add(choice.type)}
                  >
                    <strong>{busyType === choice.type ? 'Aggiungo…' : choice.label}</strong>
                    <span>{choice.hint}</span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        </details>
      )}

      {canEdit && tripId && dayId && <DayTemplateSaver tripId={tripId} dayId={dayId} />}

      {status && (
        <p className="planner-quick-add-status" role="status">
          {status}
        </p>
      )}
    </div>
  )
}
