import { useState } from 'react'
import InlineConfirm from './InlineConfirm'
import './inline-confirm.css'

interface DeleteSectionProps {
  title: string
  description: string
  buttonLabel: string
  confirmTitle: string
  confirmMessage: string
  confirmLabel: string
  onDelete: () => Promise<void>
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
}: DeleteSectionProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirm = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await onDelete()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Eliminazione non riuscita.')
      setBusy(false)
    }
  }

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
