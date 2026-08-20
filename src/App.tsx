import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import StorageLabPage from './features/storage-lab/StorageLabPage'
import TravelIndexPage from './features/trips/TravelIndexPage'
import AppShell from './ui/layout/AppShell'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TravelIndexPage />} />
          <Route path="lab" element={<StorageLabPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
