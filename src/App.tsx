import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import DayFormPage from './features/days/DayFormPage'
import StorageLabPage from './features/storage-lab/StorageLabPage'
import ArchivedTripsPage from './features/trips/ArchivedTripsPage'
import TravelIndexPage from './features/trips/TravelIndexPage'
import TripDetailPage from './features/trips/TripDetailPage'
import TripFormPage from './features/trips/TripFormPage'
import AppShell from './ui/layout/AppShell'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TravelIndexPage />} />
          <Route path="archive" element={<ArchivedTripsPage />} />
          <Route path="trips/new" element={<TripFormPage mode="create" />} />
          <Route path="trips/:tripId" element={<TripDetailPage />} />
          <Route path="trips/:tripId/edit" element={<TripFormPage mode="edit" />} />
          <Route path="trips/:tripId/days/new" element={<DayFormPage mode="create" />} />
          <Route path="trips/:tripId/days/:dayId/edit" element={<DayFormPage mode="edit" />} />
          <Route path="lab" element={<StorageLabPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
