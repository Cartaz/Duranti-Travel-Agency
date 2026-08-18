import { useCallback, useEffect, useState } from 'react'
import {
  addRecord, clearLab, exportVault, getOpfsDiagnostics, getRecords, getStorageStatus,
  importVault, requestPersistentStorage, appendOpfsProbe, type LabRecord, type OpfsDiagnostics,
} from './storage-lab'

type Status = Awaited<ReturnType<typeof getStorageStatus>>
const fmt = (bytes: number) => { if (!bytes) return '0 B'; const units = ['B','KB','MB','GB']; const index = Math.min(Math.floor(Math.log(bytes)/Math.log(1024)), units.length-1); return `${(bytes/1024**index).toFixed(index ? 1 : 0)} ${units[index]}` }
const initialStatus: Status = { indexedDb:false, opfs:false, persistApi:false, persisted:null, usage:0, quota:0, online:navigator.onLine }
const initialOpfs: OpfsDiagnostics = { files:0, bytes:0, expectedBytes:0, filesDetail:[] }

export default function App() {
  const [status,setStatus]=useState<Status>(initialStatus); const [records,setRecords]=useState<LabRecord[]>([]); const [opfs,setOpfs]=useState<OpfsDiagnostics>(initialOpfs); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false); const [password,setPassword]=useState('duranti-test')
  const refresh=useCallback(async(delay=0)=>{ if(delay) await new Promise(r=>setTimeout(r,delay)); const [nextStatus,nextRecords,nextOpfs]=await Promise.all([getStorageStatus(),getRecords(),getOpfsDiagnostics().catch(()=>initialOpfs)]); setStatus(nextStatus); setRecords(nextRecords); setOpfs(nextOpfs) },[])
  useEffect(()=>{ void refresh(); const handler=()=>void refresh(); window.addEventListener('online',handler); window.addEventListener('offline',handler); return()=>{window.removeEventListener('online',handler);window.removeEventListener('offline',handler)} },[refresh])
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await action();await refresh(250)}catch(error){setMessage(error instanceof Error?error.message:String(error))}finally{setBusy(false)}}
  const createTestData=()=>run(async()=>{const now=new Date().toISOString();await addRecord({id:crypto.randomUUID(),createdAt:now,label:'Duranti persistence test',payload:JSON.stringify({createdAt:now,random:crypto.randomUUID(),note:'If this survives a browser restart, IndexedDB is working.'})});setMessage('Test record written to IndexedDB.')})
  const add100Mb=()=>run(async()=>{const result=await appendOpfsProbe();setMessage(`Wrote 100 MB. OPFS files: ${result.files}; exact bytes: ${fmt(result.bytes)}.`)})
  const requestPersist=()=>run(async()=>{const result=await requestPersistentStorage();setMessage(result?'Persistent storage granted.':'Persistent storage was not granted.')})
  const clear=()=>run(async()=>{await clearLab();setMessage('Lab storage cleared. OPFS diagnostic files and IndexedDB records removed.')})
  const exportTestVault=()=>run(async()=>{const blob=await exportVault(password);const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`DurantiStorageLab-${new Date().toISOString().replaceAll(':','-')}.duranti-test`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setMessage('Vault generated. Save the downloaded file in Files.')})
  const importTestVault=()=>{
    if(busy)return
    setBusy(true);setMessage('')
    const input=document.createElement('input');input.type='file';input.onchange=async()=>{
      const file=input.files?.[0]
      if(!file){setBusy(false);return}
      setMessage(`Reading ${file.name} (${fmt(file.size)})…`)
      try{
        const imported=await importVault(file,password)
        const after=await getRecords()
        if(after.length<imported) throw new Error(`Vault reported ${imported} imported record(s), but IndexedDB contains only ${after.length}. Import verification failed.`)
        setRecords(after);await refresh(250);setMessage(`Imported and verified ${imported} record(s) from encrypted vault. IndexedDB now contains ${after.length}.`)
      }catch(error){setMessage(error instanceof Error?error.message:'The selected file could not be imported.')}
      finally{setBusy(false);input.value=''}
    }
    input.click()
  }
  const usagePercent=status.quota?Math.min(100,status.usage/status.quota*100):0
  return <main className="lab-shell"><header className="hero"><p className="eyebrow">DURANTI TRAVEL AGENCY</p><h1>Storage Lab</h1><p>PoC barebone per verificare persistenza, OPFS, storage persistente e Vault cifrato prima di costruire l'app.</p></header>
    <section className="status-grid"><StatusCard label="IndexedDB" ok={status.indexedDb} value={status.indexedDb?'AVAILABLE':'UNAVAILABLE'}/><StatusCard label="OPFS" ok={status.opfs} value={status.opfs?'AVAILABLE':'UNAVAILABLE'}/><StatusCard label="Persistent API" ok={status.persistApi} value={status.persistApi?'AVAILABLE':'UNAVAILABLE'}/><StatusCard label="Persistent grant" ok={status.persisted===true} value={status.persisted===null?'UNKNOWN':status.persisted?'YES':'NO'}/><StatusCard label="Network" ok={status.online} value={status.online?'ONLINE':'OFFLINE'}/></section>
    <section className="panel storage-panel"><div><span className="label">Browser storage estimate</span><strong>{fmt(status.usage)} / {fmt(status.quota)}</strong><small>Stima di StorageManager; non è la dimensione fisica dell'OPFS.</small></div><div className="meter"><span style={{width:`${usagePercent}%`}}/></div><div className="diagnostics-grid"><div><span>OPFS diagnostic files</span><strong>{opfs.files}</strong></div><div><span>Exact OPFS bytes</span><strong>{fmt(opfs.bytes)}</strong></div><div><span>Expected bytes</span><strong>{fmt(opfs.expectedBytes)}</strong></div><div><span>Size check</span><strong className={opfs.bytes===opfs.expectedBytes?'ok':'warn'}>{opfs.bytes===opfs.expectedBytes?'MATCH':'MISMATCH'}</strong></div></div></section>
    <section className="panel"><div className="section-heading"><div><span className="label">1 — Baseline + OPFS diagnostics</span><h2>Storage operativo</h2></div><span className="badge">{records.length} record</span></div><div className="actions"><button onClick={createTestData} disabled={busy}>Create test data</button><button onClick={add100Mb} disabled={busy||!status.opfs}>Add 100 MB to OPFS</button><button onClick={requestPersist} disabled={busy||!status.persistApi}>Request persistent storage</button><button className="danger" onClick={clear} disabled={busy}>Clear lab storage</button></div><p className="hint">Ogni click crea un file OPFS distinto da esattamente 100 MB. La diagnostica reale è separata dalla stima di StorageManager.</p></section>
    <section className="panel vault-panel"><div className="section-heading"><div><span className="label">2 — Recovery</span><h2>Duranti Vault</h2></div><span className="badge secure">AES-256-GCM</span></div><p>Il Vault di prova è una copia cifrata e indipendente dallo storage dell'origine web. È il candidato per il backup resistente alla cancellazione dei dati Safari.</p><label className="password">Password di test<input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="off"/></label><div className="actions"><button onClick={exportTestVault} disabled={busy||!password}>Export encrypted vault</button><button onClick={importTestVault} disabled={busy||!password}>Import vault</button></div><p className="hint">L'importazione attende il completamento del file picker, verifica la scrittura su IndexedDB rileggendo i record e aggiorna la UI solo dopo la verifica.</p></section>
    <section className="panel checklist"><div className="section-heading"><div><span className="label">3 — Protocollo</span><h2>Test da eseguire su iPhone 16</h2></div></div><ol><li>Installa Duranti sulla Home Screen.</li><li>Create test data → chiudi e riapri.</li><li>Request persistent storage → verifica Persistent grant.</li><li>Add 100 MB ripetuto → verifica file count, exact bytes e MATCH.</li><li>Chiudi/riapri → verifica che i file OPFS abbiano ancora le stesse dimensioni.</li><li>Clear lab storage → verifica che i file OPFS diagnostic e i record spariscano.</li><li>Export encrypted vault → salva il file in Files.</li><li>Conserva il file fuori da Safari.</li><li>Impostazioni → Safari → Cancella cronologia e dati dei siti web.</li><li>Riapri Duranti → verifica lo storage interno.</li><li>Import vault → verifica il ripristino.</li></ol></section>{message&&<div className="toast" role="status">{message}</div>}</main>
}
function StatusCard({label,value,ok}:{label:string;value:string;ok:boolean}){return <div className="status-card"><span>{label}</span><strong className={ok?'ok':'warn'}>{value}</strong></div>}
