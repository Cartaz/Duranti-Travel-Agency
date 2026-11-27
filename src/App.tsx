import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell, { type AppShellReadiness } from './ui/layout/AppShell'

// Each page is its own chunk so the first paint does not parse every feature.
// The service worker precaches all chunks, so this stays fully offline-capable.
const TravelIndexPage = lazy(() => import('./features/trips/TravelIndexPage'))
const ArchivedTripsPage = lazy(() => import('./features/trips/ArchivedTripsPage'))
const PlaceCatalogPage = lazy(() => import('./features/places/PlaceCatalogPage'))
const TravelersPage = lazy(() => import('./features/travelers/TravelersPage'))
const TravelerFormPage = lazy(() => import('./features/travelers/TravelerFormPage'))
const TravelerDocumentsPage = lazy(() => import('./features/travelers/TravelerDocumentsPage'))
const VaultBackupPage = lazy(() => import('./features/vault/VaultBackupPage'))
const TripFormPage = lazy(() => import('./features/trips/TripFormPage'))
const TripDetailPage = lazy(() => import('./features/trips/TripDetailPage'))
const TravelBookPage = lazy(() => import('./features/travel-book/TravelBookPage'))
const DayFormPage = lazy(() => import('./features/days/DayFormPage'))
const GuidedDayPlannerPage = lazy(() => import('./features/planner/GuidedDayPlannerPage'))
// The storage diagnostics lab writes 100 MiB probes and a test-only Vault format:
// it exists only in development builds and is not shipped to users.
const StorageLabPage = import.meta.env.DEV ? lazy(() => import('./features/storage-lab/StorageLabPage')) : undefined

function page(element: ReactNode): ReactNode {
  return (
    <Suspense
      fallback={
        <p className="trip-feedback" role="status">
          Apro la pagina…
        </p>
      }
    >
      {element}
    </Suspense>
  )
}

export default function App({ readiness = {} }: { readiness?: AppShellReadiness }) {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell readiness={readiness} />}>
          <Route index element={page(<TravelIndexPage />)} />
          <Route path="archive" element={page(<ArchivedTripsPage />)} />
          <Route path="places" element={page(<PlaceCatalogPage />)} />
          <Route path="travelers" element={page(<TravelersPage />)} />
          <Route path="travelers/new" element={page(<TravelerFormPage mode="create" />)} />
          <Route path="travelers/:travelerId/edit" element={page(<TravelerFormPage mode="edit" />)} />
          <Route path="travelers/:travelerId/documents" element={page(<TravelerDocumentsPage />)} />
          <Route path="backup" element={page(<VaultBackupPage />)} />
          <Route path="trips/new" element={page(<TripFormPage mode="create" />)} />
          <Route path="trips/:tripId" element={page(<TripDetailPage />)} />
          <Route path="trips/:tripId/edit" element={page(<TripFormPage mode="edit" />)} />
          <Route path="trips/:tripId/book" element={page(<TravelBookPage />)} />
          <Route path="trips/:tripId/days/new" element={page(<DayFormPage mode="create" />)} />
          <Route path="trips/:tripId/days/:dayId" element={page(<GuidedDayPlannerPage />)} />
          <Route path="trips/:tripId/days/:dayId/edit" element={page(<DayFormPage mode="edit" />)} />
          {StorageLabPage && <Route path="lab" element={page(<StorageLabPage />)} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
