import { NavLink, Outlet } from 'react-router-dom'

function navClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'app-nav-link active' : 'app-nav-link'
}

export default function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <NavLink to="/" className="app-brand" aria-label="Duranti Travel Agency — libro dei viaggi">
          <span className="app-brand-mark" aria-hidden="true">D</span>
          <span>
            <strong>Duranti Travel Agency</strong>
            <small>viaggia con noi, viaggio, con i topi</small>
          </span>
        </NavLink>
        <span className="offline-badge">offline-first</span>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="app-bottom-nav" aria-label="Navigazione principale">
        <NavLink to="/" end className={navClassName}>
          <span className="nav-glyph book-glyph" aria-hidden="true" />
          <span>Libro</span>
        </NavLink>
        <NavLink to="/lab" className={navClassName}>
          <span className="nav-glyph lab-glyph" aria-hidden="true" />
          <span>Lab</span>
        </NavLink>
      </nav>
    </div>
  )
}
