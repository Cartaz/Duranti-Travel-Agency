import { useState } from 'react'

export interface BootstrapFailureProps {
  message: string
  interruptedRestore: boolean
  onRetry(): void
  onAbandonRestore(): Promise<void>
}

/**
 * Shown when the local archive cannot be opened. Bootstrap failures must stay
 * actionable: retrying is always offered, and an interrupted Vault restore that
 * cannot be recovered automatically can be explicitly abandoned.
 */
export default function BootstrapFailure({
  message,
  interruptedRestore,
  onRetry,
  onAbandonRestore,
}: BootstrapFailureProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const abandon = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await onAbandonRestore()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile abbandonare il ripristino interrotto.')
      setBusy(false)
    }
  }

  return (
    <main className="bootstrap-failure" role="alert">
      <h1>DTAgency</h1>
      <p>Impossibile inizializzare l’archivio locale su questo dispositivo.</p>
      <p>
        <strong>Dettaglio:</strong> {message}
      </p>
      <div className="bootstrap-failure-actions">
        <button type="button" disabled={busy} onClick={onRetry}>
          Riprova
        </button>
      </div>
      {interruptedRestore && (
        <section aria-label="Ripristino interrotto">
          <h2>Ripristino da backup interrotto</h2>
          <p>
            Un ripristino precedente non si è concluso e il recupero automatico non riesce a completarlo. Se continua a
            fallire puoi abbandonarlo: DTAgency ripartirà con i dati presenti adesso sul dispositivo, che potrebbero
            essere incompleti. La copia di sicurezza interna dei file precedenti non viene cancellata.
          </p>
          {!confirming ? (
            <button type="button" disabled={busy} onClick={() => setConfirming(true)}>
              Abbandona il ripristino interrotto
            </button>
          ) : (
            <div className="bootstrap-failure-actions">
              <button type="button" disabled={busy} onClick={() => void abandon()}>
                {busy ? 'Abbandono…' : 'Conferma e avvia DTAgency'}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
                Annulla
              </button>
            </div>
          )}
          {error && <p>{error}</p>}
        </section>
      )}
    </main>
  )
}
