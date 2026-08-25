import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  MAX_DAY_TEMPLATE_DESCRIPTION_LENGTH,
  MAX_DAY_TEMPLATE_NAME_LENGTH,
} from '../../application/templates/day-template-application'
import { useApplicationServices } from '../../ui/application-context'
import './day-template-saver.css'

export default function DayTemplateSaver({ tripId, dayId }: { tripId: string; dayId: string }) {
  const { days, templates } = useApplicationServices()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    let cancelled = false
    void days.getTripDay(tripId, dayId)
      .then((day) => {
        if (cancelled || !day) return
        setName(day.title?.trim() || `Giorno ${day.sequence}`)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [dayId, days, tripId])

  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(''), 5000)
    return () => window.clearTimeout(timer)
  }, [status])

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const template = await templates.createPersonalDayTemplate(tripId, dayId, { name, description })
      setStatus(`Modello “${template.name}” salvato. Lo troverai quando crei una nuova giornata.`)
      detailsRef.current?.removeAttribute('open')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare questa giornata come modello.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="day-template-save-wrap" aria-label="Modello personale">
      <details className="day-template-save" ref={detailsRef}>
        <summary>
          <span><strong>Salva come modello</strong><small>Riutilizza la struttura di questa giornata in altri viaggi.</small></span>
          <span className="day-template-save-badge">Personale</span>
        </summary>
        <form className="day-template-save-form" onSubmit={(event) => void submit(event)}>
          <p>Verranno copiati titoli, testo e checklist. Luoghi, prenotazioni, spese e collegamenti specifici verranno svuotati. Diario, foto e video non fanno parte del modello.</p>
          {error && <p className="day-template-save-error" role="alert">{error}</p>}
          <label><span>Nome del modello *</span><input required maxLength={MAX_DAY_TEMPLATE_NAME_LENGTH} value={name} placeholder="Giornata musei e centro" disabled={saving} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Descrizione</span><textarea rows={3} maxLength={MAX_DAY_TEMPLATE_DESCRIPTION_LENGTH} value={description} placeholder="Quando usare questo modello…" disabled={saving} onChange={(event) => setDescription(event.target.value)} /><small>{description.length}/{MAX_DAY_TEMPLATE_DESCRIPTION_LENGTH}</small></label>
          <div className="day-template-save-actions"><button type="submit" disabled={saving || !name.trim()}>{saving ? 'Salvataggio…' : 'Salva modello'}</button></div>
        </form>
      </details>
      {status && <p className="day-template-save-status" role="status">{status}</p>}
    </section>
  )
}
