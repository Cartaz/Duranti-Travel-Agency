import { useState } from 'react'
import { Link } from 'react-router-dom'
import InlineConfirm from './InlineConfirm'
import './inline-confirm.css'

interface DeleteSectionProps {
  title: string
  description: string
  buttonLabel: string
  confirmTitle: string
  confirmMessage: string
  confirmLabel: string
  /** Performs the deletion; may report files whose bytes could not be removed yet. */
  onDelete: () => Promise<{ pendingFileCleanup: number } | void>
  /** Called once the user has seen the outcome (immediately when nothing is pending). */
  onDeleted: () => void
}

/** A destructive action that always requires an explicit inline confirmation. */
export default function DeleteSection({
  title,
  description,
  buttonLabel,
  confirmTitle,
  confirmMessage,
  confirmLabel,
  onDelete,
  onDeleted,
}: DeleteSectionProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingFiles, setPendingFiles] = useState(0)

  const confirm = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const outcome = await onDelete()
      if (outcome && outcome.pendingFileCleanup > 0) {
        setPendingFiles(outcome.pendingFileCleanup)
        setBusy(false)
        return
      }
      onDeleted()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Eliminazione non riuscita.')
      setBusy(false)
    }
  }

  if (pendingFiles > 0)
    return (
      <section className="delete-section" aria-label={title} role="status">
        <strong>Eliminazione completata</strong>
        <p>
          {pendingFiles === 1
            ? '1 file non è stato ancora rimosso'
            : `${pendingFiles} file non sono stati ancora rimossi`}{' '}
          dal dispositivo e occupa ancora spazio. Puoi liberarlo dalla pagina Backup con “Libera spazio”.
        </p>
        <div className="inline-confirm-actions">
          <Link to="/backup">Apri Backup</Link>
          <button type="button" onClick={onDeleted}>
            Continua
          </button>
        </div>
      </section>
    )

  return (
    <section className="delete-section" aria-label={title}>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {!confirming ? (
        <button type="button" className="delete-section-button" onClick={() => setConfirming(true)}>
          {buttonLabel}
        </button>
      ) : (
        <InlineConfirm
          title={confirmTitle}
          message={confirmMessage}
          confirmLabel={confirmLabel}
          busy={busy}
          onConfirm={() => void confirm()}
          onCancel={() => setConfirming(false)}
        />
      )}
      {error && (
        <p className="trip-feedback trip-feedback-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
