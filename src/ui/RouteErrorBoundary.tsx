import { Component, type ErrorInfo, type ReactNode } from 'react'

interface RouteErrorBoundaryState {
  error?: Error
}

/**
 * Keeps a failing page from unmounting the whole app. The typical case is a
 * lazy route chunk that no longer exists after a deploy replaced the service
 * worker precache while this tab was open: reloading fetches the new build.
 */
export default class RouteErrorBoundary extends Component<{ children: ReactNode }, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = {}

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('DTAgency page failed to render.', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <section className="trip-feedback trip-feedback-error" role="alert">
        <strong>Impossibile aprire questa pagina.</strong>
        <p>Probabilmente è disponibile una nuova versione di DTAgency. I tuoi dati non sono stati modificati.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Ricarica l’app
        </button>
      </section>
    )
  }
}
