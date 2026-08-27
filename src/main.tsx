import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { dayApplication } from './composition/days'
import { expenseApplication } from './composition/expenses'
import { itineraryApplication } from './composition/itinerary'
import { dayMediaApplication } from './composition/media'
import { placeImportApplication } from './composition/place-import'
import { placeApplication } from './composition/places'
import { plannerApplication } from './composition/planner'
import { reservationApplication } from './composition/reservations'
import { dayTemplateApplication } from './composition/templates'
import { travelBookApplication } from './composition/travel-book'
import { travelerDocumentApplication } from './composition/traveler-documents'
import { travelerApplication } from './composition/travelers'
import { tripApplication } from './composition/trips'
import { bootstrapApplication, type ApplicationBootstrapState } from './data/bootstrap'
import { ApplicationProvider } from './ui/application-context'
import type { AppReadinessNotice } from './ui/readiness'
import './styles.css'
import './ui/guided-ux.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('DTAgency root element was not found.')
const root = ReactDOM.createRoot(rootElement)

function readinessNoticesFrom(state: ApplicationBootstrapState): AppReadinessNotice[] {
  const notices: AppReadinessNotice[] = []

  if (state.storagePersistence === 'best-effort') {
    notices.push({
      id: 'storage-best-effort',
      kind: 'warning',
      title: 'Archiviazione locale non garantita',
      message: 'Il browser può liberare i dati locali se lo spazio scarseggia. Mantieni un backup Vault aggiornato.',
      backupAction: true,
    })
  } else if (state.storagePersistence === 'unsupported' || state.storagePersistence === 'unknown') {
    notices.push({
      id: 'storage-persistence-unknown',
      kind: 'warning',
      title: 'Durabilità locale non verificata',
      message: 'Questo browser non permette di confermare che i dati locali siano persistenti. È consigliato mantenere un backup Vault aggiornato.',
      backupAction: true,
    })
  }

  if (state.restoreRecovery === 'rolled-back') {
    notices.push({
      id: 'vault-recovery-rollback',
      kind: 'info',
      title: 'Ripristino Vault recuperato',
      message: 'Un ripristino interrotto è stato annullato automaticamente e DTAgency ha ripristinato lo stato precedente.',
    })
  } else if (state.restoreRecovery === 'finalized-committed') {
    notices.push({
      id: 'vault-recovery-finalized',
      kind: 'info',
      title: 'Ripristino Vault finalizzato',
      message: 'DTAgency ha completato automaticamente la finalizzazione di un ripristino già committato prima dell’interruzione.',
    })
  }

  return notices
}

async function startApplication(): Promise<void> {
  try {
    const bootstrap = await bootstrapApplication()
    root.render(
      <React.StrictMode>
        <ApplicationProvider services={{
          trips: tripApplication,
          days: dayApplication,
          planner: plannerApplication,
          reservations: reservationApplication,
          media: dayMediaApplication,
          templates: dayTemplateApplication,
          expenses: expenseApplication,
          travelers: travelerApplication,
          travelerDocuments: travelerDocumentApplication,
          places: placeApplication,
          placeImport: placeImportApplication,
          itinerary: itineraryApplication,
          travelBook: travelBookApplication,
        }}>
          <App readinessNotices={readinessNoticesFrom(bootstrap)} />
        </ApplicationProvider>
      </React.StrictMode>,
    )
  } catch (error) {
    console.error('DTAgency local bootstrap failed.', error)
    root.render(<main><h1>DTAgency</h1><p>Impossibile inizializzare l’archivio locale su questo dispositivo.</p></main>)
  }
}

void startApplication()
