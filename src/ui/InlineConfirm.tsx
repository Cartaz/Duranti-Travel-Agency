import './inline-confirm.css'

interface InlineConfirmProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function InlineConfirm({
  title,
  message,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  busy = false,
  onConfirm,
  onCancel,
}: InlineConfirmProps) {
  return (
    <div className="inline-confirm" role="alertdialog" aria-modal="false" aria-label={title}>
      <div className="inline-confirm-copy">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      <div className="inline-confirm-actions">
        <button type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
        <button className="inline-confirm-danger" type="button" disabled={busy} onClick={onConfirm}>
          {busy ? 'Attendi…' : confirmLabel}
        </button>
      </div>
    </div>
  )
}
