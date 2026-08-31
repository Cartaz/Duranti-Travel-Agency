import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Traveler, TravelerDocument, TravelerDocumentSecret } from '../../domain/entities'
import type { TravelerDocumentMetadata, TravelerDocumentView } from '../../application/travelers/document-ports'
import InlineConfirm from '../../ui/InlineConfirm'
import { useApplicationServices } from '../../ui/application-context'
import './traveler-documents.css'

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

const typeLabels: Record<TravelerDocument['type'], string> = {
  passport: 'Passaporto',
  identityCard: 'Carta d’identità',
  drivingLicense: 'Patente',
  visa: 'Visto',
  other: 'Altro documento',
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(parsed)
}

function buildSecret(form: HTMLFormElement): TravelerDocumentSecret {
  const data = new FormData(form)
  const optional = (name: string): string | undefined => {
    const value = String(data.get(name) ?? '').trim()
    return value || undefined
  }
  return {
    documentNumber: optional('documentNumber'),
    issuingCountryCode: optional('issuingCountryCode'),
    issueDate: optional('issueDate'),
    expiryDate: optional('expiryDate'),
    holderName: optional('holderName'),
    notes: optional('notes'),
  }
}

export default function TravelerDocumentsPage() {
  const { travelerId } = useParams()
  const { travelers, travelerDocuments } = useApplicationServices('travelers', 'travelerDocuments')
  const [traveler, setTraveler] = useState<Traveler>()
  const [configured, setConfigured] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [metadata, setMetadata] = useState<TravelerDocumentMetadata[]>([])
  const [documents, setDocuments] = useState<TravelerDocumentView[]>([])
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteId, setDeleteId] = useState<string>()
  const [editingId, setEditingId] = useState<string>()
  const [removeAttachmentId, setRemoveAttachmentId] = useState<string>()

  const refresh = useCallback(async (): Promise<void> => {
    if (!travelerId) return
    const [profile, security, documentMetadata] = await Promise.all([
      travelers.getTraveler(travelerId),
      travelerDocuments.getSecurityState(),
      travelerDocuments.listForTraveler(travelerId),
    ])
    setTraveler(profile)
    setConfigured(security.configured)
    setUnlocked(security.unlocked)
    setMetadata(documentMetadata)
    setDocuments(security.unlocked ? await travelerDocuments.listUnlockedForTraveler(travelerId) : [])
  }, [travelerId, travelerDocuments, travelers])

  useEffect(() => {
    let cancelled = false
    void refresh().catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile aprire i documenti protetti.')
    })
    return () => { cancelled = true }
  }, [refresh])

  const submitSecurity = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!configured && passphrase !== passphraseConfirm) {
      setError('Le due passphrase non coincidono.')
      return
    }
    if (passphrase.length < 12) {
      setError('La passphrase locale deve avere almeno 12 caratteri.')
      return
    }
    setBusy(true)
    try {
      if (configured) await travelerDocuments.unlock(passphrase)
      else await travelerDocuments.configure(passphrase)
      setPassphrase('')
      setPassphraseConfirm('')
      await refresh()
      setNotice(configured ? 'Archivio documenti sbloccato per questa sessione.' : 'Archivio cifrato configurato e sbloccato.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile sbloccare l’archivio cifrato.')
    } finally {
      setBusy(false)
    }
  }

  const createDocument = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!travelerId) return
    setError('')
    setNotice('')
    const form = event.currentTarget
    const data = new FormData(form)
    const file = data.get('attachment')
    const attachment = file instanceof File && file.size > 0 ? file : undefined
    if (attachment && attachment.size > MAX_ATTACHMENT_BYTES) {
      setError('L’allegato supera il limite cifrato di 20 MiB.')
      return
    }
    setBusy(true)
    try {
      await travelerDocuments.create({
        travelerId,
        type: String(data.get('type')) as TravelerDocument['type'],
        secret: buildSecret(form),
        ...(attachment ? { attachment } : {}),
      })
      form.reset()
      await refresh()
      setNotice('Documento cifrato salvato sul dispositivo.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare il documento cifrato.')
    } finally {
      setBusy(false)
    }
  }

  const updateDocument = async (event: FormEvent<HTMLFormElement>, documentId: string): Promise<void> => {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await travelerDocuments.updateSecret(documentId, buildSecret(event.currentTarget))
      setEditingId(undefined)
      await refresh()
      setNotice('Dettagli del documento aggiornati e cifrati.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile aggiornare il documento cifrato.')
    } finally {
      setBusy(false)
    }
  }

  const replaceAttachment = async (event: ChangeEvent<HTMLInputElement>, documentId: string): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setNotice('')
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('L’allegato supera il limite cifrato di 20 MiB.')
      return
    }
    setBusy(true)
    try {
      await travelerDocuments.replaceAttachment(documentId, file)
      await refresh()
      setNotice('Allegato sostituito e cifrato sul dispositivo.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile sostituire l’allegato cifrato.')
    } finally {
      setBusy(false)
    }
  }

  const confirmRemoveAttachment = async (): Promise<void> => {
    if (!removeAttachmentId) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await travelerDocuments.removeAttachment(removeAttachmentId)
      setRemoveAttachmentId(undefined)
      await refresh()
      setNotice('Allegato rimosso dal documento.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile rimuovere l’allegato.')
    } finally {
      setBusy(false)
    }
  }

  const downloadAttachment = async (document: TravelerDocumentView): Promise<void> => {
    setError('')
    try {
      const file = await travelerDocuments.getAttachment(document.id)
      if (!file) {
        setError('Questo documento non ha un allegato disponibile.')
        return
      }
      const url = URL.createObjectURL(file)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = file.name
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile aprire l’allegato cifrato.')
    }
  }

  const lock = (): void => {
    travelerDocuments.lock()
    setUnlocked(false)
    setDocuments([])
    setEditingId(undefined)
    setDeleteId(undefined)
    setRemoveAttachmentId(undefined)
    setNotice('Archivio documenti bloccato. La chiave è stata rimossa dalla sessione.')
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteId) return
    setBusy(true)
    setError('')
    try {
      await travelerDocuments.delete(deleteId)
      setDeleteId(undefined)
      setEditingId(undefined)
      await refresh()
      setNotice('Documento rimosso dalla vista attiva.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile rimuovere il documento.')
    } finally {
      setBusy(false)
    }
  }

  if (!travelerId) return <p className="trip-feedback trip-feedback-error">Profilo viaggiatore non valido.</p>

  return <section className="traveler-documents-page" aria-labelledby="traveler-documents-title">
    <header className="traveler-documents-heading">
      <div>
        <p className="eyebrow">Cassaforte personale</p>
        <h1 id="traveler-documents-title">Documenti di {traveler?.displayName ?? 'viaggiatore'}</h1>
        <p>Numeri, note e scansioni sono cifrati localmente prima di essere scritti sul dispositivo.</p>
      </div>
      <div className="traveler-documents-actions">
        <Link className="trip-secondary-action" to="/travelers">Torna ai viaggiatori</Link>
        {unlocked && <button type="button" className="trip-secondary-action" onClick={lock}>Blocca cassaforte</button>}
      </div>
    </header>

    {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}
    {notice && <p className="trip-feedback" role="status">{notice}</p>}

    {!unlocked && <article className="traveler-vault-card">
      <div><p className="eyebrow">{configured ? 'Archivio bloccato' : 'Prima configurazione'}</p><h2>{configured ? 'Sblocca i documenti' : 'Proteggi i documenti'}</h2><p>{configured ? 'Inserisci la passphrase locale. Non viene salvata e la chiave resta solo in memoria.' : 'Scegli una passphrase locale di almeno 12 caratteri. Servirà per leggere passaporti e scansioni su questo archivio.'}</p></div>
      <form className="traveler-vault-form" onSubmit={(event) => void submitSecurity(event)}>
        <label><span>Passphrase locale</span><input type="password" autoComplete={configured ? 'current-password' : 'new-password'} minLength={12} required value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /></label>
        {!configured && <label><span>Ripeti passphrase</span><input type="password" autoComplete="new-password" minLength={12} required value={passphraseConfirm} onChange={(event) => setPassphraseConfirm(event.target.value)} /></label>}
        <button className="trip-primary-action" type="submit" disabled={busy}>{busy ? 'Attendo…' : configured ? 'Sblocca' : 'Configura e sblocca'}</button>
      </form>
      {configured && metadata.length > 0 && <p className="traveler-locked-count">{metadata.length === 1 ? '1 documento protetto presente.' : `${metadata.length} documenti protetti presenti.`} I dettagli restano nascosti finché la cassaforte è bloccata.</p>}
    </article>}

    {unlocked && <>
      <article className="traveler-vault-card">
        <div><p className="eyebrow">Nuovo documento</p><h2>Aggiungi alla cassaforte</h2><p>L’allegato è facoltativo e può pesare al massimo 20 MiB.</p></div>
        <form className="traveler-document-form" onSubmit={(event) => void createDocument(event)}>
          <label><span>Tipo</span><select name="type" defaultValue="passport">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Intestatario</span><input name="holderName" defaultValue={traveler ? `${traveler.firstName} ${traveler.lastName}` : ''} /></label>
          <label><span>Numero documento</span><input name="documentNumber" autoComplete="off" /></label>
          <label><span>Paese emittente</span><input name="issuingCountryCode" placeholder="IT" maxLength={3} autoCapitalize="characters" /></label>
          <label><span>Data emissione</span><input name="issueDate" type="date" /></label>
          <label><span>Scadenza</span><input name="expiryDate" type="date" /></label>
          <label className="traveler-document-wide"><span>Note private</span><textarea name="notes" rows={3} /></label>
          <label className="traveler-document-wide"><span>Scansione / file</span><input name="attachment" type="file" accept="image/*,.pdf,application/pdf" /></label>
          <button className="trip-primary-action traveler-document-wide" type="submit" disabled={busy}>{busy ? 'Cifro e salvo…' : 'Salva documento cifrato'}</button>
        </form>
      </article>

      <div className="traveler-document-list">
        {documents.length === 0 && <div className="travelers-empty"><strong>Nessun documento cifrato.</strong><span>Aggiungi passaporto, carta d’identità, patente o visto.</span></div>}
        {documents.map((document) => <article className="traveler-document-card" key={document.id}>
          {editingId === document.id ? (
            <form className="traveler-document-form traveler-document-edit-form" onSubmit={(event) => void updateDocument(event, document.id)}>
              <div className="traveler-document-edit-heading traveler-document-wide"><span className="traveler-document-type">{typeLabels[document.type]}</span><strong>Modifica dettagli cifrati</strong></div>
              <label><span>Intestatario</span><input name="holderName" defaultValue={document.secret.holderName ?? ''} /></label>
              <label><span>Numero documento</span><input name="documentNumber" autoComplete="off" defaultValue={document.secret.documentNumber ?? ''} /></label>
              <label><span>Paese emittente</span><input name="issuingCountryCode" maxLength={3} autoCapitalize="characters" defaultValue={document.secret.issuingCountryCode ?? ''} /></label>
              <label><span>Data emissione</span><input name="issueDate" type="date" defaultValue={document.secret.issueDate ?? ''} /></label>
              <label><span>Scadenza</span><input name="expiryDate" type="date" defaultValue={document.secret.expiryDate ?? ''} /></label>
              <label className="traveler-document-wide"><span>Note private</span><textarea name="notes" rows={3} defaultValue={document.secret.notes ?? ''} /></label>
              <div className="traveler-document-edit-actions traveler-document-wide">
                <button className="trip-primary-action" type="submit" disabled={busy}>{busy ? 'Cifro e salvo…' : 'Salva modifiche'}</button>
                <button className="trip-secondary-action" type="button" disabled={busy} onClick={() => setEditingId(undefined)}>Annulla</button>
              </div>
            </form>
          ) : (
            <div className="traveler-document-card-copy">
              <div><span className="traveler-document-type">{typeLabels[document.type]}</span><strong>{document.secret.holderName || traveler?.displayName || 'Documento personale'}</strong></div>
              <dl>
                <div><dt>Numero</dt><dd>{document.secret.documentNumber || '—'}</dd></div>
                <div><dt>Emesso da</dt><dd>{document.secret.issuingCountryCode || '—'}</dd></div>
                <div><dt>Emissione</dt><dd>{formatDate(document.secret.issueDate)}</dd></div>
                <div><dt>Scadenza</dt><dd>{formatDate(document.secret.expiryDate)}</dd></div>
              </dl>
              {document.secret.notes && <p className="traveler-document-notes">{document.secret.notes}</p>}
              {document.attachment && <span className="traveler-document-file">{document.attachment.originalName || 'Allegato'} · {humanBytes(document.attachment.sizeBytes)}</span>}
            </div>
          )}
          <div className="traveler-document-card-actions">
            {editingId !== document.id && <button type="button" className="trip-secondary-action" disabled={busy} onClick={() => setEditingId(document.id)}>Modifica</button>}
            {document.attachment && <button type="button" className="trip-secondary-action" disabled={busy} onClick={() => void downloadAttachment(document)}>Apri allegato</button>}
            <label className="trip-secondary-action traveler-document-file-action">
              <span>{document.attachment ? 'Sostituisci allegato' : 'Aggiungi allegato'}</span>
              <input type="file" accept="image/*,.pdf,application/pdf" disabled={busy} onChange={(event) => void replaceAttachment(event, document.id)} />
            </label>
            {document.attachment && <button type="button" className="trip-secondary-action" disabled={busy} onClick={() => setRemoveAttachmentId(document.id)}>Rimuovi allegato</button>}
            <button type="button" className="traveler-document-delete" disabled={busy} onClick={() => setDeleteId(document.id)}>Rimuovi documento</button>
          </div>
          {removeAttachmentId === document.id && <InlineConfirm title="Rimuovere l’allegato?" message="Il file cifrato verrà rimosso dal documento. I dettagli del documento resteranno disponibili." confirmLabel="Rimuovi allegato" busy={busy} onConfirm={() => void confirmRemoveAttachment()} onCancel={() => setRemoveAttachmentId(undefined)} />}
          {deleteId === document.id && <InlineConfirm title="Rimuovere questo documento?" message="Il documento non sarà più mostrato nella cassaforte attiva. I dati restano gestiti dal lifecycle cifrato e dal backup DTAgency." confirmLabel="Rimuovi documento" busy={busy} onConfirm={() => void confirmDelete()} onCancel={() => setDeleteId(undefined)} />}
        </article>)}
      </div>
    </>}
  </section>
}