import { useState } from 'react'
import type { Template } from '../../domain/entities'
import { MAX_DAY_TEMPLATE_NAME_LENGTH } from '../../application/templates/day-template-application'
import InlineConfirm from '../../ui/InlineConfirm'
import { useApplicationServices } from '../../ui/application-context'
import './day-template-manager.css'

export default function DayTemplateManager({ templates, disabled = false, onChanged }: { templates: Template[]; disabled?: boolean; onChanged: () => Promise<void> }) {
  const { templates: templateApplication } = useApplicationServices('templates')
  const [editingId, setEditingId] = useState<string>()
  const [name, setName] = useState('')
  const [busyId, setBusyId] = useState<string>()
  const [deleteId, setDeleteId] = useState<string>()
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  if (templates.length === 0) return null

  const startRename = (template: Template): void => {
    setEditingId(template.id); setName(template.name); setDeleteId(undefined); setError(''); setStatus('')
  }
  const cancelRename = (): void => { setEditingId(undefined); setName(''); setError('') }

  const saveRename = async (template: Template): Promise<void> => {
    if (disabled || busyId) return
    setBusyId(template.id); setError(''); setStatus('')
    try {
      const updated = await templateApplication.renamePersonalDayTemplate(template.id, name)
      setEditingId(undefined); setName(''); await onChanged(); setStatus(`Modello rinominato in “${updated.name}”.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile rinominare il modello.')
    } finally { setBusyId(undefined) }
  }

  const remove = async (template: Template): Promise<void> => {
    if (disabled || busyId) return
    setBusyId(template.id); setError(''); setStatus('')
    try {
      await templateApplication.deletePersonalDayTemplate(template.id)
      setDeleteId(undefined)
      if (editingId === template.id) cancelRename()
      await onChanged(); setStatus(`Modello “${template.name}” eliminato.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile eliminare il modello.')
    } finally { setBusyId(undefined) }
  }

  return (
    <details className="day-template-manager">
      <summary><span><strong>Gestisci modelli personali</strong><small>{templates.length} {templates.length === 1 ? 'modello salvato' : 'modelli salvati'}</small></span></summary>
      <div className="day-template-manager-body">
        <p>I modelli predefiniti restano protetti. Qui puoi rinominare o eliminare solo quelli creati da te.</p>
        {error && <p className="day-template-manager-error" role="alert">{error}</p>}
        {status && <p className="day-template-manager-status" role="status">{status}</p>}
        <div className="day-template-manager-list">
          {templates.map((template) => {
            const editing = editingId === template.id
            const deleting = deleteId === template.id
            const busy = busyId === template.id
            return (
              <article className="day-template-manager-item" key={template.id}>
                <div className="day-template-manager-copy">
                  {editing ? (
                    <label><span>Nome del modello</span><input autoFocus maxLength={MAX_DAY_TEMPLATE_NAME_LENGTH} disabled={disabled || busy} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveRename(template) } if (event.key === 'Escape') cancelRename() }} /><small>{name.length}/{MAX_DAY_TEMPLATE_NAME_LENGTH}</small></label>
                  ) : <><strong>{template.name}</strong>{template.description && <span>{template.description}</span>}</>}
                </div>
                {!deleting && <div className="day-template-manager-actions">{editing ? <><button type="button" disabled={disabled || busy} onClick={cancelRename}>Annulla</button><button type="button" disabled={disabled || busy || !name.trim()} onClick={() => void saveRename(template)}>{busy ? 'Salvataggio…' : 'Salva nome'}</button></> : <><button type="button" disabled={disabled || Boolean(busyId)} onClick={() => startRename(template)}>Rinomina</button><button className="day-template-manager-delete" type="button" disabled={disabled || Boolean(busyId)} onClick={() => { setEditingId(undefined); setDeleteId(template.id); setError(''); setStatus('') }}>Elimina</button></>}</div>}
                {deleting && <InlineConfirm title="Eliminare questo modello personale?" message={`“${template.name}” non comparirà più tra le strutture disponibili. Le giornate già create con questo modello non verranno modificate.`} confirmLabel="Elimina modello" busy={busy} onCancel={() => setDeleteId(undefined)} onConfirm={() => void remove(template)} />}
              </article>
            )
          })}
        </div>
      </div>
    </details>
  )
}
