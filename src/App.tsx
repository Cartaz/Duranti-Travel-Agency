import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import DayFormPage from './features/days/DayFormPage'
import GuidedDayPlannerPage from './features/planner/GuidedDayPlannerPage'
import StorageLabPage from './features/storage-lab/StorageLabPage'
import ArchivedTripsPage from './features/trips/ArchivedTripsPage'
import TravelIndexPage from './features/trips/TravelIndexPage'
import TripDetailPage from './features/trips/TripDetailPage'
import TripFormPage from './features/trips/TripFormPage'
import TravelerFormPage from './features/travelers/TravelerFormPage'
import TravelersPage from './features/travelers/TravelersPage'
import VaultBackupPage from './features/vault/VaultBackupPage'
import AppShell from './ui/layout/AppShell'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TravelIndexPage />} />
          <Route path="archive" element={<ArchivedTripsPage />} />
          <Route path="travelers" element={<TravelersPage />} />
          <Route path="travelers/new" element={<TravelerFormPage mode="create" />} />
          <Route path="travelers/:travelerId/edit" element={<TravelerFormPage mode="edit" />} />
          <Route path="backup" element={<VaultBackupPage />} />
          <Route path="trips/new" element={<TripFormPage mode="create" />} />
          <Route path="trips/:tripId" element={<TripDetailPage />} />
          <Route path="trips/:tripId/edit" element={<TripFormPage mode="edit" />} />
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
