import { useCallback, useEffect, useState } from 'react'
import {
  addRecord,
  clearLab,
  exportVault,
  getRecords,
  getStorageStatus,
  importVault,
  removeOpfsProbe,
  requestPersistentStorage,
  writeOpfsProbe,
  type LabRecord,
} from './storage-lab'

type Status = Awaited<ReturnType<typeof getStorageStatus>>

const fmt = (bytes: number) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

const initialStatus: Status = {
  indexedDb: false,
  opfs: false,
  persistApi: false,
  persisted: null,
  usage: 0,
  quota: 0,
  online: navigator.onLine,
}

export default function App() {
  const [status, setStatus] = useState<Status>(initialStatus)
  const [records, setRecords] = useState<LabRecord[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('duranti-test')

  const refresh = useCallback(async () => {
    setStatus(await getStorageStatus())
    setRecords(await getRecords())
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
      await refresh()
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
      label: 'Duranti persistence test',
      payload: JSON.stringify({ createdAt: now, random: crypto.randomUUID(), note: 'If this survives a browser restart, IndexedDB is working.' }),
    })
    setMessage('Test record written to IndexedDB.')
  })

  const add100Mb = () => run(async () => {
    await writeOpfsProbe(100 * 1024 * 1024)
    setMessage('100 MB OPFS probe written.')
  })

  const requestPersist = () => run(async () => {
    const result = await requestPersistentStorage()
    setMessage(result ? 'Persistent storage granted.' : 'Persistent storage was not granted.')
  })

  const clear = () => run(async () => {
    await clearLab()
    await removeOpfsProbe()
    setMessage('Lab storage cleared.')
  })

  const exportTestVault = () => run(async () => {
    const blob = await exportVault(password)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `DurantiStorageLab-${new Date().toISOString().replaceAll(':', '-')}.duranti-test`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setMessage('Vault generated. On iPhone, use the share sheet / Save to Files if offered.')
  })

  const importTestVault = () => run(async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.duranti-test,application/vnd.duranti.vault+json,application/json'
    input.onchange = async () => {
      if (!input.files?.[0]) return
      setBusy(true)
      try {
        const count = await importVault(input.files[0], password)
        await refresh()
        setMessage(`Imported ${count} record(s) from the encrypted vault.`)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(false)
      }
    }
    input.click()
  })

  return (
    <main className="lab-shell">
      <header className="hero">
        <p className="eyebrow">DURANTI TRAVEL AGENCY</p>
        <h1>Storage Lab</h1>
        <p>PoC barebone per verificare persistenza, OPFS, storage persistente e Vault cifrato prima di costruire l'app.</p>
      </header>

      <section className="status-grid">
        <StatusCard label="IndexedDB" ok={status.indexedDb} value={status.indexedDb ? 'AVAILABLE' : 'UNAVAILABLE'} />
        <StatusCard label="OPFS" ok={status.opfs} value={status.opfs ? 'AVAILABLE' : 'UNAVAILABLE'} />
        <StatusCard label="Persistent API" ok={status.persistApi} value={status.persistApi ? 'AVAILABLE' : 'UNAVAILABLE'} />
        <StatusCard label="Persistent grant" ok={status.persisted === true} value={status.persisted === null ? 'UNKNOWN' : status.persisted ? 'YES' : 'NO'} />
        <StatusCard label="Network" ok={status.online} value={status.online ? 'ONLINE' : 'OFFLINE'} />
      </section>

      <section className="panel storage-panel">
        <div>
          <span className="label">Browser storage estimate</span>
          <strong>{fmt(status.usage)} / {fmt(status.quota)}</strong>
        </div>
        <div className="meter"><span style={{ width: `${status.quota ? Math.min(100, (status.usage / status.quota) * 100) : 0}%` }} /></div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div><span className="label">1 — Baseline</span><h2>Storage operativo</h2></div>
          <span className="badge">{records.length} record</span>
        </div>
        <div className="actions">
          <button onClick={createTestData} disabled={busy}>Create test data</button>
          <button onClick={add100Mb} disabled={busy || !status.opfs}>Add 100 MB to OPFS</button>
          <button onClick={requestPersist} disabled={busy || !status.persistApi}>Request persistent storage</button>
          <button className="danger" onClick={clear} disabled={busy}>Clear lab storage</button>
        </div>
        <p className="hint">Dopo aver creato dati, chiudi/riapri la Web App e verifica che il record resti. Il test di cancellazione Safari va eseguito manualmente dalle impostazioni di iOS.</p>
      </section>

      <section className="panel vault-panel">
        <div className="section-heading">
          <div><span className="label">2 — Recovery</span><h2>Duranti Vault</h2></div>
          <span className="badge secure">AES-256-GCM</span>
        </div>
        <p>Il Vault di prova è una copia cifrata e indipendente dallo storage dell'origine web. È il candidato per il backup resistente alla cancellazione dei dati Safari.</p>
        <label className="password">Password di test<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" /></label>
        <div className="actions">
          <button onClick={exportTestVault} disabled={busy || !password}>Export encrypted vault</button>
          <button onClick={importTestVault} disabled={busy || !password}>Import vault</button>
        </div>
        <p className="hint">PoC: il file viene esportato dal browser. Su iPhone dobbiamo verificare sul dispositivo reale il passaggio al foglio di condivisione e il salvataggio in Files.</p>
      </section>

      <section className="panel checklist">
        <div className="section-heading"><div><span className="label">3 — Protocollo</span><h2>Test da eseguire su iPhone 16</h2></div></div>
        <ol>
          <li>Installa Duranti sulla Home Screen.</li>
          <li>Create test data → chiudi e riapri.</li>
          <li>Request persistent storage → verifica Persistent grant.</li>
          <li>Add 100 MB → osserva usage/quota e stabilità.</li>
          <li>Export encrypted vault → salva il file in Files.</li>
          <li>Conserva il file fuori da Safari.</li>
          <li>Impostazioni → Safari → Cancella cronologia e dati dei siti web.</li>
          <li>Riapri Duranti: lo storage interno dovrebbe risultare vuoto.</li>
          <li>Import vault → verifica il ripristino.</li>
          <li>Ripeti con foto/video reali quando implementeremo il media layer.</li>
        </ol>
      </section>

      {message && <div className="toast" role="status">{message}</div>}
    </main>
  )
}

function StatusCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="status-card"><span>{label}</span><strong className={ok ? 'ok' : 'warn'}>{value}</strong></div>
}
