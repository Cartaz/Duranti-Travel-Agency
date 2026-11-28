import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell, { type AppShellReadiness } from './ui/layout/AppShell'
import RouteErrorBoundary from './ui/RouteErrorBoundary'

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

// Keyed per route so a failed page does not keep its error state after navigation.
function page(route: string, element: ReactNode): ReactNode {
  return (
    <RouteErrorBoundary key={route}>
      <Suspense
        fallback={
          <p className="trip-feedback" role="status">
            Apro la pagina…
          </p>
        }
      >
        {element}
      </Suspense>
    </RouteErrorBoundary>
  )
}

export default function App({ readiness = {} }: { readiness?: AppShellReadiness }) {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell readiness={readiness} />}>
          <Route index element={page('index', <TravelIndexPage />)} />
          <Route path="archive" element={page('archive', <ArchivedTripsPage />)} />
          <Route path="places" element={page('places', <PlaceCatalogPage />)} />
          <Route path="travelers" element={page('travelers', <TravelersPage />)} />
          <Route path="travelers/new" element={page('travelers/new', <TravelerFormPage mode="create" />)} />
          <Route
            path="travelers/:travelerId/edit"
            element={page('travelers/:travelerId/edit', <TravelerFormPage mode="edit" />)}
          />
          <Route
            path="travelers/:travelerId/documents"
            element={page('travelers/:travelerId/documents', <TravelerDocumentsPage />)}
          />
          <Route path="backup" element={page('backup', <VaultBackupPage />)} />
          <Route path="trips/new" element={page('trips/new', <TripFormPage mode="create" />)} />
          <Route path="trips/:tripId" element={page('trips/:tripId', <TripDetailPage />)} />
          <Route path="trips/:tripId/edit" element={page('trips/:tripId/edit', <TripFormPage mode="edit" />)} />
          <Route path="trips/:tripId/book" element={page('trips/:tripId/book', <TravelBookPage />)} />
          <Route
            path="trips/:tripId/days/new"
            element={page('trips/:tripId/days/new', <DayFormPage mode="create" />)}
          />
          <Route
            path="trips/:tripId/days/:dayId"
            element={page('trips/:tripId/days/:dayId', <GuidedDayPlannerPage />)}
          />
          <Route
            path="trips/:tripId/days/:dayId/edit"
            element={page('trips/:tripId/days/:dayId/edit', <DayFormPage mode="edit" />)}
          />
          {StorageLabPage && <Route path="lab" element={page('lab', <StorageLabPage />)} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
