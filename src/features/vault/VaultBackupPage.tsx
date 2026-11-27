import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MIN_PASSPHRASE_LENGTH, passphrasePolicyError } from '../../lib/passphrase-policy'
import type { MediaStorageReclaimResult, MediaStorageScan } from '../../application/archive/archive-application'
import { useApplicationServices } from '../../ui/application-context'
import { useArchiveStatus } from '../../ui/archive-status'
import InlineConfirm from '../../ui/InlineConfirm'
import {
  discardPreparedVault,
  loadPreparedVaultFile,
  prepareVaultExport,
  type PreparedVaultExport,
  type VaultExportProgress,
} from '../../vault/export'
import {
  discardStagedVaultImport,
  stageVaultImport,
  type StagedVaultImport,
  type VaultImportProgress,
} from '../../vault/validated-import'
import { commitStagedVaultImport, type VaultRestoreProgress, type VaultRestoreResult } from '../../vault/restore'
import { canShareVaultFile, downloadVaultFile, isDTAgencyVaultFile, shareVaultFile } from '../../vault/share'
import './vault-backup.css'

const PREPARED_VAULT_GRACE_MS = 60_000

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`
}

function progressText(progress: VaultExportProgress | VaultImportProgress | VaultRestoreProgress | undefined): string {
  if (!progress) return ''
  const phaseLabels: Record<string, string> = {
    snapshot: 'Creo uno snapshot coerente dei dati…',
    inventory: 'Inventario file locali…',
    encrypting: 'Cifro il backup…',
    header: 'Controllo il file…',
    manifest: 'Decifro e valido il contenuto…',
    staging: 'Preparo il ripristino in area isolata…',
    recovering: 'Controllo eventuali ripristini interrotti…',
    backup: 'Creo il rollback dei dati correnti…',
    'promoting-files': 'Ripristino i file…',
    'committing-database': 'Ripristino i dati strutturati…',
    verifying: 'Verifico il ripristino…',
    cleanup: 'Pulisco i file temporanei…',
    complete: 'Operazione completata.',
  }
  const base = phaseLabels[progress.phase] ?? 'Operazione in corso…'
  if (!progress.bytesTotal) return base
  const percent = Math.min(100, Math.round((progress.bytesCompleted / progress.bytesTotal) * 100))
  return `${base} ${percent}%`
}

export default function VaultBackupPage() {
  const [exportPassword, setExportPassword] = useState('')
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('')
  const [prepared, setPrepared] = useState<PreparedVaultExport>()
  const [preparedFile, setPreparedFile] = useState<File>()
  const [exportProgress, setExportProgress] = useState<VaultExportProgress>()
  const [exportBusy, setExportBusy] = useState(false)

  const [importFile, setImportFile] = useState<File>()
  const [importPassword, setImportPassword] = useState('')
  const [staged, setStaged] = useState<StagedVaultImport>()
  const [importProgress, setImportProgress] = useState<VaultImportProgress>()
  const [restoreProgress, setRestoreProgress] = useState<VaultRestoreProgress>()
  const [importBusy, setImportBusy] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)

  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [restoreReport, setRestoreReport] = useState<VaultRestoreResult>()
  const [confirmDownloadSaved, setConfirmDownloadSaved] = useState(false)
  const { status: archiveStatus, recordBackupSaved, requestPersistence } = useArchiveStatus()
  const { archive } = useApplicationServices('archive')
  const [storageScan, setStorageScan] = useState<MediaStorageScan>()
  const [storageResult, setStorageResult] = useState<MediaStorageReclaimResult>()
  const [storageBusy, setStorageBusy] = useState(false)
  const [confirmReclaim, setConfirmReclaim] = useState(false)

  const handleScanStorage = async (): Promise<void> => {
    clearFeedback()
    setStorageBusy(true)
    setStorageResult(undefined)
    setConfirmReclaim(false)
    try {
      setStorageScan(await archive.scanStorage())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile analizzare lo spazio occupato.')
    } finally {
      setStorageBusy(false)
    }
  }

  const handleReclaimStorage = async (): Promise<void> => {
    if (!storageScan) return
    clearFeedback()
    setStorageBusy(true)
    try {
      setStorageResult(await archive.reclaimStorage(storageScan))
      setStorageScan(undefined)
      setConfirmReclaim(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile liberare lo spazio.')
    } finally {
      setStorageBusy(false)
    }
  }

  // Temporary Vault copies can be as large as every stored photo and video.
  // Release them when the user leaves this page instead of leaving them in OPFS.
  const pendingArtifactsRef = useRef<{ prepared?: PreparedVaultExport; staged?: StagedVaultImport }>({})
  pendingArtifactsRef.current = { prepared, staged }
  useEffect(
    () => () => {
      const pending = pendingArtifactsRef.current
      // A download or share started just before leaving may still be reading the
      // OPFS-backed file, so give it the same grace period as object URLs.
      const prepared = pending.prepared
      if (prepared) {
        window.setTimeout(() => void discardPreparedVault(prepared).catch(() => undefined), PREPARED_VAULT_GRACE_MS)
      }
      if (pending.staged) void discardStagedVaultImport(pending.staged).catch(() => undefined)
    },
    [],
  )

  const markBackupSaved = async (): Promise<void> => {
    try {
      await recordBackupSaved()
      // Moving data outside the browser is the moment the user cares most about durability.
      if (archiveStatus?.persistence === 'best-effort') await requestPersistence()
    } catch (cause) {
      console.error('DTAgency could not record the backup date.', cause)
    }
  }

  const canShare = useMemo(() => Boolean(preparedFile && canShareVaultFile(preparedFile)), [preparedFile])

  const clearFeedback = (): void => {
    setNotice('')
    setError('')
  }

  const handlePrepare = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    clearFeedback()
    const policyError = passphrasePolicyError(exportPassword)
    if (policyError) {
      setError(policyError)
      return
    }
    if (exportPassword !== exportPasswordConfirm) {
      setError('Le due password del backup non coincidono.')
      return
    }

    setExportBusy(true)
    try {
      if (prepared) await discardPreparedVault(prepared)
      setPrepared(undefined)
      setPreparedFile(undefined)
      const result = await prepareVaultExport(exportPassword, { onProgress: setExportProgress })
      const file = await loadPreparedVaultFile(result)
      setPrepared(result)
      setPreparedFile(file)
      setNotice('Backup cifrato pronto. Salvalo fuori da questo browser.')
      setExportPassword('')
      setExportPasswordConfirm('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile preparare il backup.')
    } finally {
      setExportBusy(false)
    }
  }

  const handleDiscardPrepared = async (): Promise<void> => {
    if (!prepared) return
    clearFeedback()
    try {
      await discardPreparedVault(prepared)
      setPrepared(undefined)
      setPreparedFile(undefined)
      setExportProgress(undefined)
      setNotice('Backup temporaneo rimosso dal dispositivo.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile rimuovere il backup temporaneo.')
    }
  }

  const handleShare = async (): Promise<void> => {
    if (!preparedFile) return
    clearFeedback()
    try {
      await shareVaultFile(preparedFile)
      await markBackupSaved()
      setNotice('Backup consegnato al foglio di condivisione del dispositivo.')
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : 'Impossibile condividere il backup.')
    }
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>): void => {
    clearFeedback()
    const file = event.target.files?.[0]
    if (!file) {
      setImportFile(undefined)
      return
    }
    if (!isDTAgencyVaultFile(file)) {
      setImportFile(undefined)
      event.target.value = ''
      setError('Seleziona un file DTAgency con estensione .dtagency.')
      return
    }
    setImportFile(file)
  }

  const handleStage = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    clearFeedback()
    if (!importFile) {
      setError('Seleziona prima il file .dtagency da ripristinare.')
      return
    }
    if (!importPassword) {
      setError('Inserisci la password con cui è stato creato il backup.')
      return
    }

    setImportBusy(true)
    try {
      if (staged) await discardStagedVaultImport(staged)
      setStaged(undefined)
      setConfirmRestore(false)
      const result = await stageVaultImport(importFile, importPassword, { onProgress: setImportProgress })
      setStaged(result)
      setImportPassword('')
      setNotice('Backup verificato. Controlla i dettagli prima di sostituire i dati correnti.')
    } catch (cause) {
      setStaged(undefined)
      setError(cause instanceof Error ? cause.message : 'Impossibile verificare il backup.')
    } finally {
      setImportBusy(false)
    }
  }

  const handleCancelStaged = async (): Promise<void> => {
    if (!staged) return
    clearFeedback()
    setImportBusy(true)
    try {
      await discardStagedVaultImport(staged)
      setStaged(undefined)
      setImportProgress(undefined)
      setConfirmRestore(false)
      setNotice('Ripristino annullato: i dati correnti non sono stati modificati.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile pulire i dati temporanei del ripristino.')
    } finally {
      setImportBusy(false)
    }
  }

  const handleRestore = async (): Promise<void> => {
    if (!staged) return
    clearFeedback()
    setImportBusy(true)
    try {
      const result = await commitStagedVaultImport(staged, { mode: 'replace', onProgress: setRestoreProgress })
      setStaged(undefined)
      setConfirmRestore(false)
      if (!result.databaseVerified || !result.filesVerified || result.verificationErrors.length > 0) {
        // Keep the verification report on screen: an automatic reload would hide it.
        setRestoreReport(result)
      } else {
        setNotice('Ripristino completato e verificato. Ricarico l’app con i dati ripristinati.')
        window.setTimeout(() => window.location.reload(), 700)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Il ripristino non è riuscito.')
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <section className="vault-page" aria-labelledby="vault-title">
      <header className="vault-heading">
        <p className="eyebrow">Sicurezza dei dati</p>
        <h1 id="vault-title">Backup e ripristino</h1>
        <p>
          I dati operativi vivono sul dispositivo. Un file <strong>.dtagency</strong> cifrato è la copia portatile da
          conservare anche fuori dal browser.
        </p>
        <Link to="/" className="vault-back-link">
          ← Torna ai viaggi
        </Link>
      </header>

      {error && (
        <p className="vault-feedback vault-feedback-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="vault-feedback" role="status">
          {notice}
        </p>
      )}

      <article className="vault-card">
        <div>
          <p className="eyebrow">1 · Proteggi</p>
          <h2>Crea un backup cifrato</h2>
          <p>La password non viene salvata. Ti servirà per aprire questo backup in futuro.</p>
        </div>

        <form className="vault-form" onSubmit={(event) => void handlePrepare(event)}>
          <label>
            <span>Password del backup</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSPHRASE_LENGTH}
              required
              value={exportPassword}
              onChange={(event) => setExportPassword(event.target.value)}
            />
          </label>
          <label>
            <span>Ripeti la password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSPHRASE_LENGTH}
              required
              value={exportPasswordConfirm}
              onChange={(event) => setExportPasswordConfirm(event.target.value)}
            />
          </label>
          <button className="vault-primary" type="submit" disabled={exportBusy}>
            {exportBusy ? 'Preparo…' : 'Prepara backup'}
          </button>
        </form>

        {exportProgress && (
          <p className="vault-progress" role="status">
            {progressText(exportProgress)}
          </p>
        )}

        {prepared && preparedFile && (
          <div className="vault-result">
            <strong>{prepared.fileName}</strong>
            <span>
              {humanBytes(prepared.sizeBytes)} · {prepared.sourceFileCount} file locali
            </span>
            <div className="vault-actions">
              {canShare && (
                <button type="button" onClick={() => void handleShare()}>
                  Salva / Condividi
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  downloadVaultFile(preparedFile)
                  // A started download can still be cancelled in the save dialog:
                  // only an explicit confirmation counts as a saved backup.
                  setConfirmDownloadSaved(true)
                }}
              >
                Scarica file
              </button>
              <button type="button" className="vault-subtle" onClick={() => void handleDiscardPrepared()}>
                Scarta copia temporanea
              </button>
            </div>
            {confirmDownloadSaved && (
              <div className="vault-actions">
                <span>Hai salvato il file fuori dal browser?</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDownloadSaved(false)
                    void markBackupSaved().then(() => setNotice('Backup registrato come salvato.'))
                  }}
                >
                  Sì, l’ho salvato
                </button>
              </div>
            )}
          </div>
        )}
      </article>

      <article className="vault-card vault-restore-card">
        <div>
          <p className="eyebrow">2 · Recupera</p>
          <h2>Ripristina da un backup</h2>
          <p>
            Il file viene prima verificato, decifrato e validato semanticamente in un’area isolata. I dati correnti non
            cambiano finché non confermi il ripristino.
          </p>
        </div>

        <form className="vault-form" onSubmit={(event) => void handleStage(event)}>
          <label>
            <span>File DTAgency</span>
            <input type="file" accept=".dtagency,application/x-dtagency-vault" required onChange={handleFile} />
          </label>
          <label>
            <span>Password del backup</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={importPassword}
              onChange={(event) => setImportPassword(event.target.value)}
            />
          </label>
          <button className="vault-primary" type="submit" disabled={importBusy}>
            {importBusy ? 'Verifico…' : 'Verifica backup'}
          </button>
        </form>

        {importProgress && !restoreProgress && (
          <p className="vault-progress" role="status">
            {progressText(importProgress)}
          </p>
        )}
        {restoreProgress && (
          <p className="vault-progress" role="status">
            {progressText(restoreProgress)}
          </p>
        )}

        {restoreReport && (
          <div className="vault-result vault-restore-report" role="alert">
            <strong>Ripristino completato con avvisi di verifica</strong>
            <span>
              I dati del backup sono stati applicati, ma alcune verifiche successive non sono andate a buon fine.
              Conserva il file .dtagency originale e controlla viaggi e media prima di continuare.
            </span>
            <ul>
              {!restoreReport.databaseVerified && (
                <li>L’impronta del database ripristinato non corrisponde al backup.</li>
              )}
              {!restoreReport.filesVerified && <li>L’inventario dei file ripristinati non corrisponde al backup.</li>}
              {restoreReport.verificationErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
              {!restoreReport.cleanupComplete && (
                <li>Alcuni file temporanei del ripristino non sono stati rimossi; verranno ripuliti in seguito.</li>
              )}
            </ul>
            <div className="vault-actions">
              <button type="button" onClick={() => window.location.reload()}>
                Ricarica l’app
              </button>
            </div>
          </div>
        )}

        {staged && (
          <div className="vault-result vault-staged">
            <strong>Backup verificato</strong>
            <span>
              Creato il{' '}
              {new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(staged.archiveCreatedAt),
              )}
            </span>
            <span>
              {staged.manifest.database.tables.reduce((total, table) => total + table.rows.length, 0)} record ·{' '}
              {staged.sourceFileCount} file · {humanBytes(staged.sourceBytes)}
            </span>
            {!confirmRestore ? (
              <div className="vault-actions">
                <button
                  className="vault-danger"
                  type="button"
                  disabled={importBusy}
                  onClick={() => setConfirmRestore(true)}
                >
                  Ripristina questo backup
                </button>
                <button
                  className="vault-subtle"
                  type="button"
                  disabled={importBusy}
                  onClick={() => void handleCancelStaged()}
                >
                  Annulla
                </button>
              </div>
            ) : (
              <InlineConfirm
                title="Sostituire tutti i dati correnti?"
                message="Viaggi, giornate, prenotazioni, media e altri dati locali verranno sostituiti con quelli contenuti nel backup. DTAgency crea prima un rollback tecnico, ma questa operazione va confermata consapevolmente. Chiudi DTAgency nelle altre schede o finestre prima di continuare."
                confirmLabel="Sostituisci e ripristina"
                busy={importBusy}
                onConfirm={() => void handleRestore()}
                onCancel={() => setConfirmRestore(false)}
              />
            )}
          </div>
        )}
      </article>

      <article className="vault-card vault-storage-card">
        <div>
          <p className="eyebrow">3 · Spazio</p>
          <h2>Libera spazio sul dispositivo</h2>
          <p>
            Foto, video e allegati eliminati possono occupare ancora spazio. Controlla quanto puoi recuperare: nulla
            viene cancellato finché non confermi.
          </p>
        </div>
        <div className="vault-actions">
          <button type="button" disabled={storageBusy} onClick={() => void handleScanStorage()}>
            {storageBusy && !confirmReclaim ? 'Controllo…' : 'Controlla spazio recuperabile'}
          </button>
        </div>
        {storageScan && (
          <div className="vault-result" role="status">
            {storageScan.reclaimableMediaIds.length + storageScan.orphanDirectoryIds.length === 0 ? (
              <strong>Non c’è spazio da recuperare.</strong>
            ) : (
              <>
                <strong>{humanBytes(storageScan.reclaimableBytes)} recuperabili</strong>
                <span>
                  {storageScan.reclaimableMediaIds.length} file eliminati · {storageScan.orphanDirectoryIds.length} file
                  senza riferimenti
                </span>
              </>
            )}
            {storageScan.unhealthyActiveCount > 0 && (
              <span>
                Attenzione: {storageScan.unhealthyActiveCount} media attivi risultano mancanti o incoerenti. Conserva i
                tuoi backup .dtagency.
              </span>
            )}
            {storageScan.reclaimableMediaIds.length + storageScan.orphanDirectoryIds.length > 0 &&
              (!confirmReclaim ? (
                <div className="vault-actions">
                  <button type="button" disabled={storageBusy} onClick={() => setConfirmReclaim(true)}>
                    Libera spazio
                  </button>
                </div>
              ) : (
                <InlineConfirm
                  title="Eliminare definitivamente questi file?"
                  message="I file di contenuti già eliminati verranno rimossi dal dispositivo e non potranno essere recuperati, salvo da un backup .dtagency precedente."
                  confirmLabel="Elimina definitivamente"
                  busy={storageBusy}
                  onConfirm={() => void handleReclaimStorage()}
                  onCancel={() => setConfirmReclaim(false)}
                />
              ))}
          </div>
        )}
        {storageResult && (
          <p className="vault-feedback" role="status">
            Liberati {humanBytes(storageResult.freedBytes)} ·{' '}
            {storageResult.purgedMediaCount + storageResult.removedOrphanCount} file rimossi
            {storageResult.keptReferencedCount > 0
              ? ` · ${storageResult.keptReferencedCount} conservati perché ancora collegati`
              : ''}
            .
          </p>
        )}
      </article>
    </section>
  )
}
