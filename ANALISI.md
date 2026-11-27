# ANALISI — audit completo DTAgency

Data: 2026-11-27 · Commit analizzato: `fb5b71d` (main, working tree pulito) · Nessun file di codice modificato.

Legenda: **[V]** = verificato (eseguito o letto nel codice) · **[S]** = sospetto, non verificato a runtime.

---

## Riassunto (5 righe)

1. Progetto **sano nelle fondamenta**: typecheck, build, policy check e 94/94 test unitari passano; 6/7 test browser passano; Vault cifrato con staging, journal e rollback è progettato con cura e testato davvero nel browser.
2. **La CI su `main` oggi fallirebbe**: `npm audit --audit-level=high` esce con codice 1 (9 vulnerabilità, 4 high, tutte con fix disponibile), quindi il prossimo push blocca il deploy.
3. I rischi reali per i dati sono pochi ma concreti: l'app non chiede mai `navigator.storage.persist()`, i file OPFS orfani e lo staging dei backup non vengono mai ripuliti, e gli avvisi di verifica dopo un ripristino spariscono dopo 700 ms.
4. Il debito principale è la **leggibilità**: ~25 file hanno righe "minificate" fino a 2.400 caratteri, circa metà dei test unitari fa regex sul sorgente invece di testare il comportamento, e la documentazione è rimasta indietro rispetto al DB v2.
5. Verdetto: **da tenere e sistemare, non da riscrivere**. Le fasi 1–3 qui sotto (circa 2–3 giorni) eliminano i rischi; le fasi 4–5 sono pulizia incrementale.

---

## 1. Cosa è il progetto e cosa ho eseguito

**Scopo**: PWA privata, offline-first, per pianificare viaggi (viaggi, giornate, blocchi planner, prenotazioni, spese, luoghi, viaggiatori, documenti cifrati, media) e trasformarli in un "travel book". Target principale: iPhone/Safari.

**Stack**: React 19 + React Router 7 (HashRouter), Vite 7 + vite-plugin-pwa, Dexie 4 (IndexedDB, schema v2), OPFS per i file, Web Crypto (PBKDF2 + AES-GCM / AES-KW), test con `node --test` (type stripping nativo) e Playwright. Deploy su GitHub Pages con base `/Duranti-Travel-Agency/`.

**Struttura**: `domain/` (entità pure) → `application/` (use case + ports) → `composition/` (wiring) → `data/` (Dexie, repository, OPFS) · `features/` (UI React) · `vault/` (backup cifrato) · `security/` (cifratura locale). I confini sono fatti rispettare da `scripts/architecture-policy.mjs`.

| Passo | Comando | Esito |
|---|---|---|
| Install | `npm ci` (Node 26.13, npm 12.2) | [V] OK. Avvisi: `glob@11` deprecato, postinstall di `esbuild` bloccato da `allowScripts` (la build funziona lo stesso) |
| Policy | `npm run check:policy` | [V] OK |
| Unit test | `npm test` | [V] 94/94 passati in 0,4 s |
| Typecheck | `tsc -b` | [V] OK, 0 errori |
| Build | `vite build` | [V] OK. Un solo chunk JS da 646 KB (192 KB gzip), avviso Rollup >500 KB |
| Dev server | `vite --port 5173` | [V] OK (`/` → 302 → `/Duranti-Travel-Agency/`) |
| Test browser | `playwright test` | [V] **6/7 passati, 1 fallisce in modo deterministico** (4 esecuzioni su 4, vedi A2) |
| Audit | `npm audit --audit-level=high` | [V] **exit 1**: 9 vulnerabilità (1 low, 4 moderate, 4 high) |
| Segreti | `git log --all -p` + ricerca di pattern | [V] Nessun segreto, token o chiave in cronologia; nessun `.env` mai committato |
| Codice morto | `knip` (installato solo nello scratchpad) + grep | [V] vedi C1 |

---

## 2. Problemi trovati

### Gravità ALTA

**A1 — La CI di `main` fallirà al prossimo push** [V]
- `.github/workflows/deploy-pages.yml:38` esegue `npm audit --audit-level=high`. Oggi esce con 1: `vite 7.3.6` (fs.allow bypass, launch-editor), `brace-expansion`, `fast-uri`, `source-map-js` sono high; `glob`/`minimatch`/`workbox-build`/`serialize-javascript` moderate. L'ultima CI verde è del 31/08, prima che uscissero gli advisory.
- Impatto: deploy su Pages bloccato. Sono tutte dipendenze di sviluppo e build, quindi non c'è un rischio diretto per l'utente finale.
- Correzione: `npm audit fix` (fix disponibili senza major), poi verifica che `vite` arrivi a ≥7.3.8 e rilancia l'intera suite. Va valutato a parte l'aggiornamento di `@vitejs/plugin-react` 6, `vite` 8, `vite-plugin-pwa` 2 e TypeScript 7.

**A2 — Test browser instabile/rotto: `reservation-attachment-journey`** [V]
- `tests/browser/reservation-attachment-journey.spec.cjs:44-47` verifica che il pulsante mostri `"Salvataggio…"` durante il click. Su una macchina veloce il salvataggio su IndexedDB finisce prima che Playwright faccia il polling, quindi il test fallisce sempre in locale. In CI è passato per caso di timing.
- Impatto: la suite non è affidabile, e un test che fallisce "per finta" abitua a ignorare i rossi.
- Correzione: togli l'asserzione sullo stato transitorio e verifica l'effetto persistente, cioè il valore dopo il reload (riga 52 già lo fa). Se serve testare lo stato busy, rallenta la scrittura con un hook di test.

**A3 — L'app non chiede mai lo storage persistente** [V]
- `src/data/bootstrap.ts:12-22` legge solo `navigator.storage.persisted()`. `persist()` viene chiamato solo in `src/storage-lab.ts:20`, cioè nella pagina diagnostica nascosta `/lab`. `AppShell` mostra un avviso "best-effort" ma non offre nessuna azione.
- Impatto: per un'app in cui il browser è l'unico archivio, Safari e Chromium possono rimuovere i dati sotto pressione di spazio, o dopo inattività se l'app non è installata. Questo va contro la regola n.1 di AGENTS.md (preservare i dati).
- Correzione: chiamare `navigator.storage.persist()` dopo il primo gesto dell'utente (per esempio alla creazione del primo viaggio o dal banner) ed esporre l'esito nel banner. Aggiungere anche un "ultimo backup eseguito il…" con promemoria. Oggi non esiste nessun tracciamento dell'ultimo export [V].

**A4 — Gli avvisi di verifica del ripristino si perdono** [V]
- `src/features/vault/VaultBackupPage.tsx:207-213`: se `databaseVerified`/`filesVerified` sono falsi o ci sono `verificationErrors`, la pagina mostra solo il *numero* di avvisi e ricarica dopo 700 ms. Il dettaglio degli errori non viene mai mostrato né salvato.
- Impatto: un ripristino con verifica fallita sembra riuscito. Questo viola la regola "make failures visible, actionable".
- Correzione: se ci sono avvisi niente reload automatico; mostra l'elenco e un pulsante "Ricarica", oppure salva il report in `appMeta` e mostralo dopo il reload.

### Gravità MEDIA

**M1 — Lo staging di backup ed export resta su OPFS per sempre** [V]
- L'export scrive l'intero `.dtagency` in `dtagency/vault-staging/` (`src/vault/export.ts:300-302`); l'import decifra in `dtagency/vault-import-staging/<id>/`. La pulizia avviene solo con le azioni esplicite "scarta" in `VaultBackupPage.tsx:96,117,169,189`. Non c'è cleanup all'unmount né alla navigazione, e `bootstrap.ts` gestisce solo il journal di restore.
- Impatto: se prepari un backup e cambi pagina o chiudi la tab, resta una copia grande quanto tutti i media. Su iPhone questo consuma quota e avvicina l'eviction (vedi A3).
- Correzione: nel bootstrap, dopo la recovery, rimuovere `vault-staging/*` e gli stage di import non referenziati da un journal attivo.

**M2 — I file media orfani non vengono mai rimossi** [V]
- Quando elimini un blocco prenotazione (`src/data/repositories/reservation-block-repository.ts:19`, richiamato da `reservation-application.ts` con `deletePlannerReservationBlock`), il media allegato viene solo marcato come eliminato e il file OPFS non viene mai cancellato.
- I `purge` "best-effort" ingoiano gli errori in silenzio: `reservation-application.ts:47-48` e `day-media-application.ts:197` (`catch { /* tombstone … */ }`).
- Il fallback citato nei commenti ("orphan scanner") esiste (`removeOrphanMediaDirectory`, `src/data/storage/media-integrity.ts:134`) ma **non è chiamato da nessuna parte**.
- Impatto: lo spazio occupato cresce senza limite e ogni backup Vault si porta dietro anche i file eliminati, perché l'export include tutto l'albero OPFS (`src/vault/README.md`).
- Correzione: un use case di riconciliazione esplicito (scan → elenco → conferma → purge) collegato a una sezione "Manutenzione archivio", e purge del media anche quando si elimina un blocco prenotazione.

**M3 — Se la recovery fallisce, l'app non si avvia più** [V lettura, S runtime]
- `src/data/bootstrap.ts:27` esegue `recoverInterruptedVaultRestore()` prima del render. Se lancia un'eccezione, per esempio perché la cartella di backup è mancante o corrotta (`src/vault/restore.ts`, `restoreBackupFiles` → `Vault restore backup … is missing`), `src/main.tsx:68-71` mostra solo "Impossibile inizializzare l'archivio locale", senza dettagli né via d'uscita. A ogni avvio succede di nuovo la stessa cosa.
- Correzione: una schermata di recovery con l'errore, un'opzione "esporta comunque un Vault dello stato attuale" e un'opzione esplicita "abbandona il journal" con conferma.

**M4 — Nessun coordinamento tra più tab** [S]
- Non c'è uso di Web Locks, `BroadcastChannel` o handler di `versionchange` per Vault e restore (`grep` [V]). Un restore in una tab, mentre un'altra tab ha l'app aperta e scrive, può produrre fingerprint non coerenti o file OPFS letti a metà durante `clearManagedLiveFiles()`.
- Correzione: `navigator.locks.request('dtagency:vault', …)` attorno a export, stage e commit, e un avviso "chiudi le altre schede" prima del restore.

**M5 — Race nel `purge` dei media** [V lettura]
- `src/data/repositories/media-repository.ts:236-255` cancella il file OPFS *prima* di ricontrollare dentro la transazione che il record sia ancora eliminato. Se il media viene ripristinato nel mezzo, il record torna attivo ma senza file. La probabilità è bassa in uso single-user.
- Correzione: dentro la transazione marca il record come "purging" (oppure cancella prima la riga), poi elimina il file; un file rimasto orfano è recuperabile dallo scan di M2, un record senza file no.

**M6 — Codice "minificato" in ~25 file** [V]
- Righe fino a 2.013 caratteri (`src/data/repositories/reservation-block-repository.ts`, intero repository su 6 righe), 2.384 (`src/features/places/PlaceCatalogPage.tsx`), 1.796 (`src/storage-lab.ts`), 1.155 (`src/application/reservations/reservation-application.ts`), 1.149 (`src/application/itinerary/itinerary-application.ts`). Seguono `DayPlannerPage.tsx`, `ExpenseBlockEditor.tsx`, `nominatim-place-discovery.ts`, `DayItinerarySummary.tsx` e altri.
- Impatto: i diff sono illeggibili e i bug nei punti più delicati (transazioni prenotazione e allegato) sono difficili da vedere in review. I test "a regex" (M7) dipendono da questa formattazione, quindi riformattare li rompe.
- Correzione: aggiungere Prettier (o `dprint`) con un commit di sola formattazione, *dopo* aver sistemato M7.

**M7 — Circa metà dei test unitari non testa comportamento** [V]
- 22 file su 38 in `tests/{domain,storage,vault}` leggono il sorgente con `readFile` e fanno `assert.match` su regex del codice. Esempi: `tests/vault/format.test.ts` (verifica che il testo contenga `VAULT_PBKDF2_ITERATIONS = 600_000`), `tests/storage/reservation-attachment-atomicity.test.ts` (verifica che la stringa `db.transaction('rw', db.trips, …` sia presente).
- Impatto: passano anche se il comportamento è rotto e si rompono con un rename o una riformattazione. Il conteggio di 94 test sopravvaluta la copertura reale.
- Nota positiva [V]: i test che importano davvero il codice (domain/application con fake ports) e l'harness browser (`tests/browser/harness.ts`: upgrade v1→v2, round-trip Vault IndexedDB+OPFS, manifest manomesso, rollback `files-mutating`) sono test reali e di valore.
- Correzione: tieni le regex solo come lint architetturale (confini e identificatori persistiti, il loro scopo legittimo) e sposta le invarianti di comportamento (atomicità degli allegati, formato Vault) su test eseguibili: `fake-indexeddb` in Node oppure l'harness browser esistente.
- Manca un test per il ramo di recovery `files-promoted` (fingerprint uguale o diverso) [V: non trovato nell'harness].

**M8 — Rimontaggio forzato e sincronizzazione via DOM nel planner** [V]
- `src/features/planner/GuidedDayPlannerPage.tsx:123` usa `<DayPlannerPage key={revision} />` per forzare il reload dopo ogni aggiunta. Le righe 76-100 usano `querySelectorAll('.planner-canvas .planner-block')`, `MutationObserver` e un timeout di 4 s per scrollare all'ultimo blocco.
- Inoltre `DayPlannerPage.tsx:76` ha un *secondo* percorso di `createPlannerBlock`, quindi ci sono due UI di aggiunta.
- È esattamente ciò che AGENTS.md vieta ("forced remounts, DOM synchronization, timers or observers"). Il rimontaggio perde anche lo stato locale degli editor (bozze non salvate negli altri blocchi) [S].
- Correzione: alzare lo stato dei blocchi nel wrapper (o esporre `onBlockCreated(id)` da `DayPlannerPage`) e scrollare tramite ref per id.

**M9 — Documentazione non allineata al codice** [V]
- `src/vault/README.md` dice "database baseline: dtagency, schema v1" e "Before database schema v2 can be introduced, Vault import must gain explicit snapshot migration…". Ma `DB_VERSION = 2` (`src/data/db/dtagency-db.ts:5`), l'export scrive `schemaVersion: 2` (`src/vault/export.ts:285`) e l'import accetta 1 e 2 (`src/vault/database-schema-compatibility.ts:6`).
- `src/data/db/migrations/README.md`: "Current baseline v1" e regola 9 "`DB_VERSION` may not become 2…". La version history non elenca la v2.
- `AGENTS.md`: "The current persistence baseline is DTAgency v1" non è aggiornato.
- `README.md:13` parla di "integrity reconciliation", ma la riconciliazione non è collegata (vedi M2 e C1). `src/data/README.md:10` cita "guarded reconciliation helpers" che non usa nessuno.
- `docs/architecture/file-structure.md` è una struttura "proposta" (`app/`, `styles/`, `ui/book/`…) che non corrisponde a `src/`. `src/workers/README.md` descrive sottocartelle inesistenti.
- `docs/architecture/schema-v1.md:342` dice che il chunking arriverà "in a future Vault v2", ma la v1 è già chunked.
- Correzione: aggiornare i README, aggiungere la v2 alla version history e marcare `file-structure.md` come storico (o eliminarlo).

**M10 — Mancano le funzioni di eliminazione per viaggi, giornate e viaggiatori** [V]
- `trip-application.ts` ha solo archive/restore; `day-application.ts` e `traveler-application.ts` non hanno nessuna funzione di delete o archive, e la UI non offre "Elimina".
- Impatto: una giornata creata per errore non si può rimuovere, e per i dati personali dei viaggiatori non esiste un "diritto all'oblio" locale. È una funzionalità a metà più che un bug.
- Correzione: use case di soft-delete con cascata esplicita (giornata → blocchi, prenotazioni, itinerario, media) sul modello di `softDeleteReservationBlock`.

### Gravità BASSA

**B1 — Storage Lab spedita in produzione** [V]
- `src/App.tsx:37` espone `/lab`; `src/storage-lab.ts` è una seconda implementazione crittografica (PBKDF2 a 250k iterazioni, formato `DTAGENCY-VAULT-TEST`), scritta su una riga sola, che può scrivere probe da 100 MB nella radice OPFS. È documentata come diagnostica, ma finisce nel bundle principale.
- Correzione: caricarla con `import.meta.env.DEV` o con un lazy import dietro un flag; lo stesso per la route.

**B2 — Duplicazioni minori** [V]
- `buildGoogleMapsSearchUrl` esiste due volte, quasi identica: `src/application/places/place-application.ts:39` e `src/features/places/maps-url.ts:12`.
- Tre implementazioni di "blob → download": `src/vault/share.ts:19`, `ReservationBlockEditor.tsx:268-280`, `TravelerDocumentsPage.tsx:200-213`. Quest'ultima revoca l'URL dopo 1 s, mentre le altre aspettano 60 s; con file grandi su Safari [S] il download può fallire.
- `src/features/expenses/currency.ts` è solo `export * from '../../lib/currency'`.
- Correzione: un'unica utility `lib/` per maps-url e per il download.

**B3 — Regole password incoerenti** [V]
- Il backup Vault richiede almeno 8 caratteri (`VaultBackupPage.tsx:85`), la cifratura locale almeno 12 (`src/security/local-encryption.ts:9`), eppure il backup protegge *anche* la chiave dei documenti. Correzione: un'unica policy condivisa, almeno 12 caratteri.

**B4 — Risposta Nominatim non validata, cache senza limite** [V]
- `src/data/external/nominatim-place-discovery.ts:37-38` fa `await response.json() as NominatimResult[]` senza validazione; `display_name.split` (riga 18) lancia un errore se il campo manca. La cache in `localStorage` elimina le voci scadute solo quando le rilegge.
- Correzione: validare lo shape minimo e limitare il numero di voci in cache.

**B5 — Nessun linter e nessun controllo sugli unused** [V]
- Non c'è configurazione ESLint e `tsconfig.app.json` non ha `noUnusedLocals`/`noUnusedParameters`. Per questo il codice morto di C1 non viene segnalato.

**B6 — PWA su iPhone: solo icone SVG, niente `apple-touch-icon`** [S forte]
- `vite.config.ts:20-23` e `index.html`. Safari su iOS non usa le icone SVG del manifest per la schermata Home. Correzione: PNG 180×180 più `<link rel="apple-touch-icon">`.

**B7 — Nessuna Content-Security-Policy** [V]
- `index.html` non ha un `<meta http-equiv="Content-Security-Policy">`. Per un'app che gestisce passaporti decifrati in memoria è una difesa in profondità a basso costo (`connect-src` limitato all'endpoint Nominatim).

**B8 — Residui e repository** [V]
- `public/404.html` scrive `sessionStorage.redirect`, che nessuno legge (l'app usa HashRouter).
- 68 branch, quasi tutti `chatgpt/*` già mergiati, più la PR draft #15 aperta dal 21/08.
- La CI gira anche sui push a `chatgpt/**`.
- `test-results/` di Playwright non è in `.gitignore`.

**B9 — Bundle monolitico** [V]
- 646 KB in un solo chunk, che include Storage Lab e tutte le pagine. Correzione: `React.lazy` per route (almeno `/lab`, `/backup`, il travel book).

### Codice morto [V]

**C1 — Codice morto confermato** (knip + grep)
- **File mai importati**:
  - `src/data/opfs/media-lifecycle.ts`, un wrapper inutile su `opfs-store`;
  - `src/data/storage/private-document-integrity.ts`, 320 righe: scan e riconciliazione dei documenti cifrati, mai collegato, nonostante il README Vault lo citi come step "dopo l'unlock";
  - `src/security/kdf-benchmark.ts`.
- **Export non usati, principali**:
  - `purgeTombstonedMedia`, `removeOrphanMediaDirectory` (`media-integrity.ts:130,134`);
  - `linkRepository`, `auditRepository`, `travelerDocumentRepository` (`repositories.ts:117-128`): le tabelle `links` e `auditLog` sono dichiarate nello schema ma non vengono mai scritte;
  - `assertImportRecord`, `ValidationError` (export) (`validate.ts`);
  - `VAULT_FORMAT_VERSION` ri-esportato da `app-meta.ts:4`;
  - `removeOpfsProbe`, `currencyFractionDigits`, `MAX_DAY_IMAGE_BYTES`/`MAX_DAY_VIDEO_BYTES` (export);
  - tutte le classi `*Repository` esportate accanto alle istanze.
  - In totale 27 export e 46 tipi esportati senza utilizzatori.
- **Attenzione**: le tabelle `links` e `auditLog` *non* vanno rimosse dallo schema, perché fanno parte del contratto Vault v1 e del golden snapshot. Vanno solo marcate come "riservate".
- I file `tests/browser/*.ts` segnalati da knip sono falsi positivi: sono entry dei harness HTML.

---

## 3. Cose che funzionano bene (da non toccare)

- Pipeline Vault: header in chiaro minimale, AAD che lega ogni chunk a archivio, file e indice, snapshot A/B per la consistenza, staging isolato, journal con fingerprint SHA-256 e rollback OPFS. Il round-trip e il caso "manifest manomesso" sono testati davvero nel browser [V].
- Cifratura locale: DEK non estraibile wrappata con AES-KW, PBKDF2 a 600k iterazioni, AAD per entità [V].
- Transazioni Dexie su più tabelle per le mutazioni prenotazione, itinerario e blocco [V].
- Policy check sui confini architetturali e sugli identificatori persistiti [V].
- Nessun segreto in cronologia, endpoint esterno configurabile con validazione HTTPS [V].

---

## 4. Piano di pulizia (dalla fase più sicura alla più invasiva)

| Fase | Contenuto | Rischio | Sforzo |
|---|---|---|---|
| **1. Sbloccare CI e test** | A1 (`npm audit fix` + verifica), A2 (correggere l'asserzione transitoria), `test-results/` in `.gitignore` | Molto basso | 1–2 h |
| **2. Rimozione codice morto** | C1 (3 file, export inutilizzati, `sessionStorage` nel 404), B2 (deduplicare maps-url e download), B5 (`noUnusedLocals` + ESLint base). Nessun cambio di schema | Basso | 2–4 h |
| **3. Sicurezza dei dati** | A3 (`persist()` + "ultimo backup"), A4 (report di verifica del restore), M1 (sweep dello staging al bootstrap), M3 (schermata di recovery), B3 (policy password unica) | Medio: tocca bootstrap e Vault, serve un test browser per ogni punto | 1,5–2 gg |
| **4. Test reali e documentazione** | M7 (convertire le invarianti critiche in test eseguibili, aggiungere la recovery `files-promoted`), M9 (allineare README, migrations, AGENTS e vault README alla v2) | Basso | 1–1,5 gg |
| **5. Leggibilità** | M6 (Prettier su tutto il repo in un commit dedicato, *dopo* la fase 4 per non rompere i test a regex) | Basso ma diff enorme | 2–3 h |
| **6. Refactor mirati** | M8 (planner senza remount/observer), M2 (use case di riconciliazione media + purge alla cancellazione del blocco), M5 (ordine del purge), M4 (Web Locks per il Vault), B1/B9 (Storage Lab solo in dev, lazy route) | Medio | 2–3 gg |
| **7. Funzionalità mancanti** | M10 (eliminazione di giornate, viaggi e viaggiatori con cascata), B6 (icone iOS), B7 (CSP), B4, B8 (pulizia dei branch remoti: azione esterna, richiede conferma) | Medio: nuove mutazioni sui dati | 2–3 gg |

Per tutte le fasi: nessuna modifica a `DB_VERSION`, agli identificatori persistiti o al formato Vault. M10 richiede solo soft-delete su campi già esistenti (`deletedAt`), quindi non serve una migrazione.

---

## 5. Domanda aperta

Quali fasi vuoi che esegua? Il mio consiglio è di partire da **1 + 2 + 3** in quest'ordine, con un commit per fase.
