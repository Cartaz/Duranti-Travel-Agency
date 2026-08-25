import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EMPTY_TRAVELER_DRAFT, type TravelerDraft } from '../../application/travelers/traveler-application'
import { useApplicationServices } from '../../ui/application-context'
import './travelers.css'

export default function TravelerFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { travelerId } = useParams<{ travelerId: string }>()
  const navigate = useNavigate()
  const { travelers } = useApplicationServices()
  const [draft, setDraft] = useState<TravelerDraft>(EMPTY_TRAVELER_DRAFT)
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (mode !== 'edit') return
    if (!travelerId) { setError('Identificatore del profilo mancante.'); setLoading(false); return }
    let cancelled = false
    void travelers.getTraveler(travelerId)
      .then((traveler) => { if (cancelled) return; if (!traveler) throw new Error('Profilo viaggiatore non trovato.'); setDraft(travelers.travelerToDraft(traveler)) })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile aprire il profilo.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mode, travelerId, travelers])

  const patch = (changes: Partial<TravelerDraft>): void => setDraft((current) => ({ ...current, ...changes }))
  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); if (saving) return; setSaving(true); setError('')
    try {
      if (mode === 'create') await travelers.createTraveler(draft)
      else { if (!travelerId) throw new Error('Identificatore del profilo mancante.'); await travelers.updateTraveler(travelerId, draft) }
      navigate('/travelers', { replace: true })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossibile salvare il profilo.'); setSaving(false) }
  }

  if (loading) return <p className="trip-feedback" role="status">Apro il profilo locale…</p>
  return <section className="traveler-form-page" aria-labelledby="traveler-form-title">
    <header className="travelers-heading"><div><p className="eyebrow">Rubrica locale</p><h1 id="traveler-form-title">{mode === 'create' ? 'Nuovo viaggiatore' : 'Modifica viaggiatore'}</h1><p>I documenti d’identità non vengono gestiti in questo form: resteranno dietro lo sblocco cifrato dedicato.</p></div><Link className="trip-secondary-action" to="/travelers">Annulla</Link></header>
    {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}
    <form className="traveler-form" onSubmit={(event) => void save(event)}><div className="traveler-form-grid">
      <label><span>Nome *</span><input type="text" required maxLength={100} autoComplete="given-name" value={draft.firstName} onChange={(event) => patch({ firstName: event.target.value })} /></label>
      <label><span>Cognome *</span><input type="text" required maxLength={100} autoComplete="family-name" value={draft.lastName} onChange={(event) => patch({ lastName: event.target.value })} /></label>
      <label className="traveler-form-wide"><span>Nome visualizzato</span><input type="text" maxLength={160} placeholder="Lascia vuoto per Nome Cognome" value={draft.displayName} onChange={(event) => patch({ displayName: event.target.value })} /></label>
      <label><span>Data di nascita</span><input type="date" autoComplete="bday" value={draft.birthDate ?? ''} onChange={(event) => patch({ birthDate: event.target.value })} /></label>
      <label><span>Luogo di nascita</span><input type="text" maxLength={200} value={draft.birthPlace ?? ''} onChange={(event) => patch({ birthPlace: event.target.value })} /></label>
      <label><span>Nazionalità</span><input type="text" maxLength={100} autoComplete="country-name" value={draft.nationality ?? ''} onChange={(event) => patch({ nationality: event.target.value })} /></label>
      <label><span>Genere</span><input type="text" maxLength={80} value={draft.gender ?? ''} onChange={(event) => patch({ gender: event.target.value })} /></label>
      <label><span>Email</span><input type="email" maxLength={254} autoComplete="email" value={draft.email ?? ''} onChange={(event) => patch({ email: event.target.value })} /></label>
      <label><span>Telefono</span><input type="tel" maxLength={80} autoComplete="tel" value={draft.phone ?? ''} onChange={(event) => patch({ phone: event.target.value })} /></label>
      <label className="traveler-form-wide"><span>Note</span><textarea rows={5} maxLength={4000} placeholder="Preferenze, informazioni utili per organizzare il viaggio…" value={draft.notes ?? ''} onChange={(event) => patch({ notes: event.target.value })} /></label>
    </div><div className="traveler-form-actions"><Link className="trip-secondary-action" to="/travelers">Annulla</Link><button className="trip-primary-action" type="submit" disabled={saving}>{saving ? 'Salvataggio…' : mode === 'create' ? 'Crea profilo' : 'Salva profilo'}</button></div></form>
  </section>
}
