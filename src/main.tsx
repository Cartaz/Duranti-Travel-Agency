import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { dayApplication } from './composition/days'
import { plannerApplication } from './composition/planner'
import { reservationApplication } from './composition/reservations'
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
        }}>
          <App />
        </ApplicationProvider>
      </React.StrictMode>,
    )
  } catch (error) {
    console.error('DTAgency local bootstrap failed.', error)
    root.render(
      <main>
        <h1>DTAgency</h1>
        <p>Impossibile inizializzare l’archivio locale su questo dispositivo.</p>
      </main>,
    )
  }
}

void startApplication()
