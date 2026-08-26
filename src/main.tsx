import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { dayApplication } from './composition/days'
import { expenseApplication } from './composition/expenses'
import { itineraryApplication } from './composition/itinerary'
import { dayMediaApplication } from './composition/media'
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
import './styles.css'
import './ui/guided-ux.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('DTAgency root element was not found.')
const root = ReactDOM.createRoot(rootElement)

async function startApplication(): Promise<void> {
  try {
    await bootstrapApplication()
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
          itinerary: itineraryApplication,
          travelBook: travelBookApplication,
        }}>
          <App />
        </ApplicationProvider>
      </React.StrictMode>,
    )
  } catch (error) {
    console.error('DTAgency local bootstrap failed.', error)
    root.render(<main><h1>DTAgency</h1><p>Impossibile inizializzare l’archivio locale su questo dispositivo.</p></main>)
  }
}

void startApplication()
