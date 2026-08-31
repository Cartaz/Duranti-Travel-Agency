import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import DayFormPage from './features/days/DayFormPage'
import PlaceCatalogPage from './features/places/PlaceCatalogPage'
import GuidedDayPlannerPage from './features/planner/GuidedDayPlannerPage'
import StorageLabPage from './features/storage-lab/StorageLabPage'
import TravelBookPage from './features/travel-book/TravelBookPage'
import ArchivedTripsPage from './features/trips/ArchivedTripsPage'
import TravelIndexPage from './features/trips/TravelIndexPage'
import TripDetailPage from './features/trips/TripDetailPage'
import TripFormPage from './features/trips/TripFormPage'
import TravelerDocumentsPage from './features/travelers/TravelerDocumentsPage'
import TravelerFormPage from './features/travelers/TravelerFormPage'
import TravelersPage from './features/travelers/TravelersPage'
import VaultBackupPage from './features/vault/VaultBackupPage'
import AppShell, { type AppShellReadiness } from './ui/layout/AppShell'

export default function App({ readiness = {} }: { readiness?: AppShellReadiness }) {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell readiness={readiness} />}>
          <Route index element={<TravelIndexPage />} />
          <Route path="archive" element={<ArchivedTripsPage />} />
          <Route path="places" element={<PlaceCatalogPage />} />
          <Route path="travelers" element={<TravelersPage />} />
          <Route path="travelers/new" element={<TravelerFormPage mode="create" />} />
          <Route path="travelers/:travelerId/edit" element={<TravelerFormPage mode="edit" />} />
          <Route path="travelers/:travelerId/documents" element={<TravelerDocumentsPage />} />
          <Route path="backup" element={<VaultBackupPage />} />
          <Route path="trips/new" element={<TripFormPage mode="create" />} />
          <Route path="trips/:tripId" element={<TripDetailPage />} />
          <Route path="trips/:tripId/edit" element={<TripFormPage mode="edit" />} />
          <Route path="trips/:tripId/book" element={<TravelBookPage />} />
          <Route path="trips/:tripId/days/new" element={<DayFormPage mode="create" />} />
          <Route path="trips/:tripId/days/:dayId" element={<GuidedDayPlannerPage />} />
          <Route path="trips/:tripId/days/:dayId/edit" element={<DayFormPage mode="edit" />} />
          <Route path="lab" element={<StorageLabPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
