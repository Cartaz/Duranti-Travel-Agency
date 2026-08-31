import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Traveler } from '../../domain/entities'
import { useApplicationServices } from '../../ui/application-context'
import './travelers.css'

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}

export default function TravelersPage() {
  const { travelers: travelerApplication } = useApplicationServices('travelers')
  const [travelers, setTravelers] = useState<Traveler[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void travelerApplication.listTravelers()
      .then((items) => { if (!cancelled) setTravelers(items) })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere i profili locali.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [travelerApplication])

  return <section className="travelers-page" aria-labelledby="travelers-title">
    <header className="travelers-heading"><div><p className="eyebrow">Rubrica locale</p><h1 id="travelers-title">Viaggiatori</h1><p>Crea una volta i profili e riutilizzali in tutti i capitoli del libro.</p></div><div className="travelers-heading-actions"><Link className="trip-secondary-action" to="/">Torna al libro</Link><Link className="trip-primary-action" to="/travelers/new">Nuovo profilo</Link></div></header>
    <aside className="traveler-privacy-note"><strong>Profili locali, documenti cifrati.</strong><span>I dati anagrafici restano sul dispositivo; passaporti, numeri e scansioni passano dalla cassaforte cifrata dedicata.</span></aside>
    {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}
    {loading && <p className="trip-feedback" role="status">Apro la rubrica locale…</p>}
    {!loading && travelers.length === 0 && <div className="travelers-empty"><strong>Nessun viaggiatore salvato.</strong><span>Crea il primo profilo per poterlo associare ai viaggi.</span></div>}
    <div className="traveler-card-list">{travelers.map((traveler) => {
      const birthDate = formatDate(traveler.birthDate)
      return <article className="traveler-card" key={traveler.id}><div className="traveler-avatar" aria-hidden="true">{(traveler.firstName[0] ?? '').toUpperCase()}{(traveler.lastName[0] ?? '').toUpperCase()}</div><div className="traveler-card-copy"><strong>{traveler.displayName}</strong><span>{traveler.firstName} {traveler.lastName}</span><div className="traveler-meta">{traveler.nationality && <span>{traveler.nationality}</span>}{birthDate && <span>Nato/a il {birthDate}</span>}{traveler.email && <span>{traveler.email}</span>}</div></div><div className="travelers-heading-actions"><Link className="trip-secondary-action" to={`/travelers/${traveler.id}/documents`}>Documenti</Link><Link className="trip-secondary-action" to={`/travelers/${traveler.id}/edit`}>Modifica</Link></div></article>
    })}</div>
  </section>
}
