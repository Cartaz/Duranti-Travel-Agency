import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import {
  addRecord,
  appendOpfsProbe,
  clearLab,
  exportVault,
  getOpfsDiagnostics,
  getRecords,
  getStorageStatus,
  importVault,
  requestPersistentStorage,
  type LabRecord,
  type OpfsDiagnostics,
} from '../../storage-lab'

type Status = Awaited<ReturnType<typeof getStorageStatus>>

const initialStatus: Status = {
  indexedDb: false,
  opfs: false,
  persistApi: false,
  persisted: null,
  usage: 0,
  quota: 0,
  online: navigator.onLine,
}

const initialOpfs: OpfsDiagnostics = {
  files: 0,
  bytes: 0,
  expectedBytes: 0,
  filesDetail: [],
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

export default function StorageLabPage() {
  const [status, setStatus] = useState<Status>(initialStatus)
  const [records, setRecords] = useState<LabRecord[]>([])
  const [opfs, setOpfs] = useState<OpfsDiagnostics>(initialOpfs)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('dtagency-test')

  const refresh = useCallback(async (delay = 0) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    const [nextStatus, nextRecords, nextOpfs] = await Promise.all([
      getStorageStatus(),
      getRecords(),
      getOpfsDiagnostics().catch(() => initialOpfs),
    ])
    setStatus(nextStatus)
    setRecords(nextRecords)
    setOpfs(nextOpfs)
  }, [])

  useEffect(() => {
    void refresh()
    const handler = () => void refresh()
    window.addEventListener('online', handler)
    window.addEventListener('offline', handler)
    return () => {
      window.removeEventListener('online', handler)
      window.removeEventListener('offline', handler)
    }
  }, [refresh])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
      await refresh(250)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const createTestData = () => run(async () => {
    const now = new Date().toISOString()
    await addRecord({
      id: crypto.randomUUID(),
      createdAt: now,
      label: 'DTAgency persistence test',
      payload: JSON.stringify({
        createdAt: now,
        random: crypto.randomUUID(),
        note: 'If this survives a browser restart, IndexedDB is working.',
      }),
    })
    setMessage('Test record written to IndexedDB.')
  })

  const add100Mb = () => run(async () => {
    const result = await appendOpfsProbe()
    setMessage(`Wrote 100 MB. OPFS files: ${result.files}; exact bytes: ${formatBytes(result.bytes)}.`)
  })

  const requestPersist = () => run(async () => {
    const result = await requestPersistentStorage()
    setMessage(result ? 'Persistent storage granted.' : 'Persistent storage was not granted.')
  })

  const clear = () => run(async () => {
    await clearLab()
    setMessage('Lab storage cleared. OPFS diagnostic files and IndexedDB records removed.')
  })

  const exportTestVault = () => run(async () => {
    const blob = await exportVault(password)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `DTAgency-StorageLab-${new Date().toISOString().replaceAll(':', '-')}.dtagency-test`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setMessage('Vault generated. Save the downloaded file in Files.')
  })

  const importTestVault = () => {
    if (busy) return
    setBusy(true)
    setMessage('')

    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        setBusy(false)
        return
      }

      setMessage(`Reading ${file.name} (${formatBytes(file.size)})…`)
      try {
        const imported = await importVault(file, password)
        const after = await getRecords()
        if (after.length < imported) {
          throw new Error(
            `Vault reported ${imported} imported record(s), but IndexedDB contains only ${after.length}. Import verification failed.`,
          )
        }
        setRecords(after)
        await refresh(250)
        setMessage(
          `Imported and verified ${imported} record(s) from encrypted vault. IndexedDB now contains ${after.length}.`,
        )
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'The selected file could not be imported.')
      } finally {
        setBusy(false)
        input.value = ''
      }
    }
    input.click()
  }

  const usagePercent = status.quota ? Math.min(100, status.usage / status.quota * 100) : 0

  return (
    <section className="lab-shell" aria-labelledby="storage-lab-title">
      <header className="lab-hero">
        <p className="eyebrow">DIAGNOSTICA LOCALE</p>
        <h1 id="storage-lab-title">Storage Lab</h1>
        <p>
          Strumenti di regressione per persistenza, OPFS, storage persistente e Vault PoC.
        </p>
      </header>

      <section className="status-grid">
        <StatusCard label="IndexedDB" ok={status.indexedDb} value={status.indexedDb ? 'AVAILABLE' : 'UNAVAILABLE'} />
        <StatusCard label="OPFS" ok={status.opfs} value={status.opfs ? 'AVAILABLE' : 'UNAVAILABLE'} />
        <StatusCard label="Persistent API" ok={status.persistApi} value={status.persistApi ? 'AVAILABLE' : 'UNAVAILABLE'} />
        <StatusCard
          label="Persistent grant"
          ok={status.persisted === true}
          value={status.persisted === null ? 'UNKNOWN' : status.persisted ? 'YES' : 'NO'}
        />
        <StatusCard label="Network" ok={status.online} value={status.online ? 'ONLINE' : 'OFFLINE'} />
      </section>

      <section className="panel storage-panel">
        <div>
          <span className="label">Browser storage estimate</span>
          <strong>{formatBytes(status.usage)} / {formatBytes(status.quota)}</strong>
          <small>Stima di StorageManager; non è la dimensione fisica dell'OPFS.</small>
        </div>
        <div className="meter"><span style={{ width: `${usagePercent}%` }} /></div>
        <div className="diagnostics-grid">
          <div><span>OPFS diagnostic files</span><strong>{opfs.files}</strong></div>
          <div><span>Exact OPFS bytes</span><strong>{formatBytes(opfs.bytes)}</strong></div>
          <div><span>Expected bytes</span><strong>{formatBytes(opfs.expectedBytes)}</strong></div>
          <div>
            <span>Size check</span>
            <strong className={opfs.bytes === opfs.expectedBytes ? 'ok' : 'warn'}>
              {opfs.bytes === opfs.expectedBytes ? 'MATCH' : 'MISMATCH'}
            </strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="label">1 — Baseline + OPFS diagnostics</span>
            <h2>Storage operativo</h2>
          </div>
          <span className="badge">{records.length} record</span>
        </div>
        <div className="actions">
          <button onClick={createTestData} disabled={busy}>Create test data</button>
          <button onClick={add100Mb} disabled={busy || !status.opfs}>Add 100 MB to OPFS</button>
          <button onClick={requestPersist} disabled={busy || !status.persistApi}>Request persistent storage</button>
          <button className="danger" onClick={clear} disabled={busy}>Clear lab storage</button>
        </div>
      </section>

      <section className="panel vault-panel">
        <div className="section-heading">
          <div>
            <span className="label">2 — Recovery PoC</span>
            <h2>DTAgency Vault test</h2>
          </div>
          <span className="badge secure">AES-256-GCM</span>
        </div>
        <p>Questo è il vecchio Vault diagnostico, separato dal formato production v1.</p>
        <label className="password">
          Password di test
          <input
            type="password"
            value={password}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="actions">
          <button onClick={exportTestVault} disabled={busy || !password}>Export test vault</button>
          <button onClick={importTestVault} disabled={busy || !password}>Import test vault</button>
        </div>
      </section>

      {message && <div className="toast" role="status">{message}</div>}
    </section>
  )
}

function StatusCard({
  label,
  value,
  ok,
}: {
  label: string
  value: string
  ok: boolean
}) {
  return (
    <div className="status-card">
      <span>{label}</span>
      <strong className={ok ? 'ok' : 'warn'}>{value}</strong>
    </div>
  )
}
