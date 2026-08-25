import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { Traveler } from '../../domain/entities'
import InlineConfirm from '../../ui/InlineConfirm'
import { Link } from 'react-router-dom'
import {
  attachTravelerToTrip,
  detachTravelerFromTrip,
  listTravelers,
  listTripParticipants,
  type TravelerRole,
  type TripParticipant,
} from './traveler-service'
import './travelers.css'

const roleLabels: Record<TravelerRole, string> = {
  owner: 'Titolare',
  companion: 'Compagno/a',
  child: 'Bambino/a',
  other: 'Altro',
}

export default function TripTravelersPanel({ tripId }: { tripId: string }) {
  const [participants, setParticipants] = useState<TripParticipant[]>([])
  const [travelers, setTravelers] = useState<Traveler[]>([])
  const [selectedTravelerId, setSelectedTravelerId] = useState('')
  const [selectedRole, setSelectedRole] = useState<TravelerRole>('companion')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [confirmDetachId, setConfirmDetachId] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    const [loadedParticipants, loadedTravelers] = await Promise.all([
      listTripParticipants(tripId),
      listTravelers(),
    ])
    setParticipants(loadedParticipants)
    setTravelers(loadedTravelers)
  }, [tripId])

  useEffect(() => {
    let cancelled = false
    void Promise.all([listTripParticipants(tripId), listTravelers()])
      .then(([loadedParticipants, loadedTravelers]) => {
        if (cancelled) return
        setParticipants(loadedParticipants)
        setTravelers(loadedTravelers)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere i partecipanti del viaggio.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tripId])

  const participantIds = useMemo(
    () => new Set(participants.map((participant) => participant.traveler.id)),
    [participants],
  )
  const availableTravelers = travelers.filter((traveler) => !participantIds.has(traveler.id))

  const attach = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!selectedTravelerId || busyId) return
    setBusyId(selectedTravelerId)
    setError('')
    try {
      await attachTravelerToTrip(tripId, selectedTravelerId, selectedRole)
      setSelectedTravelerId('')
      setSelectedRole('companion')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile associare il viaggiatore.')
    } finally {
      setBusyId('')
    }
  }

  const updateRole = async (participant: TripParticipant, role: TravelerRole): Promise<void> => {
    if (busyId) return
    setBusyId(participant.traveler.id)
    setError('')
    try {
      await attachTravelerToTrip(tripId, participant.traveler.id, role)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile aggiornare il ruolo.')
    } finally {
      setBusyId('')
    }
  }

  const detach = async (participant: TripParticipant): Promise<void> => {
    if (busyId) return
    setBusyId(participant.traveler.id)
    setError('')
    try {
      await detachTravelerFromTrip(tripId, participant.traveler.id)
      setConfirmDetachId('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile rimuovere il partecipante.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="trip-travelers-panel" aria-labelledby="trip-travelers-title">
      <div className="trip-travelers-heading">
        <div>
          <p className="eyebrow">Persone</p>
          <h2 id="trip-travelers-title">Viaggiatori del capitolo</h2>
          <p>I profili sono riutilizzabili: rimuoverli da un viaggio non li cancella dalla rubrica.</p>
        </div>
        <Link className="trip-secondary-action" to="/travelers">Gestisci profili</Link>
      </div>

      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}
      {loading && <p className="trip-feedback" role="status">Carico i partecipanti…</p>}

      {!loading && participants.length === 0 && (
        <p className="trip-travelers-empty">Nessun viaggiatore associato a questo capitolo.</p>
      )}

      <div className="trip-participant-list">
        {participants.map((participant) => (
          <div className="trip-participant-row" key={participant.membership.id}>
            <div className="traveler-avatar traveler-avatar-small" aria-hidden="true">
              {(participant.traveler.firstName[0] ?? '').toUpperCase()}{(participant.traveler.lastName[0] ?? '').toUpperCase()}
            </div>
            <div className="trip-participant-copy">
              <strong>{participant.traveler.displayName}</strong>
              <span>{participant.traveler.firstName} {participant.traveler.lastName}</span>
            </div>
            <select
              aria-label={`Ruolo di ${participant.traveler.displayName}`}
              value={participant.membership.role ?? 'companion'}
              disabled={Boolean(busyId)}
              onChange={(event) => void updateRole(participant, event.target.value as TravelerRole)}
            >
              {(Object.keys(roleLabels) as TravelerRole[]).map((role) => (
                <option value={role} key={role}>{roleLabels[role]}</option>
              ))}
            </select>
            <button type="button" disabled={Boolean(busyId)} onClick={() => setConfirmDetachId(participant.traveler.id)}>Rimuovi</button>
            {confirmDetachId === participant.traveler.id && (
              <InlineConfirm
                title="Rimuovere viaggiatore dal viaggio?"
                message={`Rimuovere ${participant.traveler.displayName} da questo viaggio? Il profilo resterà nella rubrica.`}
                confirmLabel="Rimuovi dal viaggio"
                busy={busyId === participant.traveler.id}
                onCancel={() => setConfirmDetachId('')}
                onConfirm={() => void detach(participant)}
              />
            )}
          </div>
        ))}
      </div>

      {!loading && travelers.length === 0 ? (
        <div className="trip-travelers-create-first">
          <span>Per aggiungere persone al viaggio serve prima almeno un profilo.</span>
          <Link className="trip-primary-action" to="/travelers/new">Crea profilo</Link>
        </div>
      ) : (
        <form className="trip-traveler-add" onSubmit={(event) => void attach(event)}>
          <label>
            <span>Profilo</span>
            <select required value={selectedTravelerId} disabled={Boolean(busyId) || availableTravelers.length === 0} onChange={(event) => setSelectedTravelerId(event.target.value)}>
              <option value="">{availableTravelers.length === 0 ? 'Tutti i profili sono già associati' : 'Scegli un viaggiatore'}</option>
              {availableTravelers.map((traveler) => (
                <option value={traveler.id} key={traveler.id}>{traveler.displayName}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Ruolo</span>
            <select value={selectedRole} disabled={Boolean(busyId)} onChange={(event) => setSelectedRole(event.target.value as TravelerRole)}>
              {(Object.keys(roleLabels) as TravelerRole[]).map((role) => (
                <option value={role} key={role}>{roleLabels[role]}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!selectedTravelerId || Boolean(busyId)}>Associa al viaggio</button>
        </form>
      )}
    </section>
  )
}
