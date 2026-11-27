import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { archiveApplication } from './composition/archive'
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
import { bootstrapApplication } from './data/bootstrap'
import { ApplicationProvider } from './ui/application-context'
import BootstrapFailure from './ui/BootstrapFailure'
import { isVaultLockBusy, onVaultRestoredElsewhere } from './vault/lock'
import { abandonInterruptedVaultRestore, hasInterruptedVaultRestore } from './vault/restore'
import type { AppShellReadiness } from './ui/layout/AppShell'
import './styles.css'
import './ui/guided-ux.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('DTAgency root element was not found.')
const root = ReactDOM.createRoot(rootElement)

type BootstrapState = Awaited<ReturnType<typeof bootstrapApplication>>

function readinessFromBootstrap(bootstrap: BootstrapState): AppShellReadiness {
  return {
    recoveryNotice:
      bootstrap.restoreRecovery === 'rolled-back'
        ? 'rolled-back'
        : bootstrap.restoreRecovery === 'finalized-committed'
          ? 'finalized'
          : undefined,
  }
}

let failureRenderCount = 0

async function renderOpeningState(): Promise<void> {
  // Bootstrap waits for the cross-tab Vault lock; say why instead of showing a blank page.
  const busy = await isVaultLockBusy().catch(() => false)
  root.render(
    <main className="bootstrap-failure" role="status">
      <h1>DTAgency</h1>
      <p>
        {busy
          ? 'Attendo che un’altra scheda di DTAgency completi un backup o un ripristino…'
          : 'Apro l’archivio locale…'}
      </p>
    </main>,
  )
}

async function startApplication(): Promise<void> {
  try {
    await renderOpeningState()
    const bootstrap = await bootstrapApplication()
    root.render(
      <React.StrictMode>
        <ApplicationProvider
          services={{
            archive: archiveApplication,
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
          }}
        >
          <App readiness={readinessFromBootstrap(bootstrap)} />
        </ApplicationProvider>
      </React.StrictMode>,
    )
  } catch (error) {
    console.error('DTAgency local bootstrap failed.', error)
    const interruptedRestore = await hasInterruptedVaultRestore().catch(() => false)
    root.render(
      <BootstrapFailure
        key={(failureRenderCount += 1)}
        message={error instanceof Error ? error.message : String(error)}
        interruptedRestore={interruptedRestore}
        onRetry={() => void startApplication()}
        onAbandonRestore={async () => {
          await abandonInterruptedVaultRestore()
          await startApplication()
        }}
      />,
    )
  }
}

// Another tab replaced the live archive with a backup: this tab's in-memory
// state is stale, so reload instead of writing over the restored data.
onVaultRestoredElsewhere(() => window.location.reload())

void startApplication()
