import { FormEvent, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import './app-shell.css'

function navClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'app-nav-link active' : 'app-nav-link'
}

type ValidatableControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

function controlLabel(control: ValidatableControl): string {
  const explicit = control.getAttribute('aria-label')?.trim()
  if (explicit) return explicit

  const label = control.labels?.[0]
  const labelText = label?.querySelector('span')?.textContent ?? label?.textContent
  const cleaned = labelText?.replace(/\s*\*\s*$/, '').trim()
  if (cleaned) return cleaned

  return control.name || 'questo campo'
}

function readableValidationMessage(control: ValidatableControl): string {
  const label = controlLabel(control)
  const { validity } = control

  if (validity.valueMissing) return `Compila “${label}”.`
  if (validity.typeMismatch) return `Controlla “${label}”: il formato inserito non è valido.`
  if (validity.patternMismatch) return `Controlla “${label}”: il valore non rispetta il formato richiesto.`
  if (validity.tooShort) return `“${label}” è troppo corto.`
  if (validity.tooLong) return `“${label}” è troppo lungo.`
  if (validity.rangeUnderflow) return `“${label}” è inferiore al valore minimo consentito.`
  if (validity.rangeOverflow) return `“${label}” supera il valore massimo consentito.`
  if (validity.stepMismatch) return `Controlla “${label}”: il valore non è ammesso.`
  if (validity.badInput) return `Controlla “${label}”: il valore inserito non può essere letto.`

  return control.validationMessage || `Controlla “${label}”.`
}

export default function AppShell() {
  const [validationNotice, setValidationNotice] = useState('')

  const handleInvalid = (event: FormEvent<HTMLElement>): void => {
    event.preventDefault()
    const target = event.target
    if (!(target instanceof HTMLInputElement)
      && !(target instanceof HTMLTextAreaElement)
      && !(target instanceof HTMLSelectElement)) return

    setValidationNotice(readableValidationMessage(target))
    target.focus({ preventScroll: true })
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div
      className="app-shell"
      onInvalidCapture={handleInvalid}
      onInputCapture={() => {
        if (validationNotice) setValidationNotice('')
      }}
    >
      <header className="app-topbar">
        <NavLink to="/" className="app-brand" aria-label="Duranti Travel Agency — viaggi">
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

      {validationNotice && (
        <div className="app-validation-notice" role="alert" aria-live="assertive">
          <div>
            <strong>Controlla i dati</strong>
            <p>{validationNotice}</p>
          </div>
          <button type="button" onClick={() => setValidationNotice('')}>Chiudi</button>
        </div>
      )}

      <nav className="app-bottom-nav app-bottom-nav-simple" aria-label="Navigazione principale">
        <NavLink to="/" end className={navClassName}>
          <span className="nav-glyph book-glyph" aria-hidden="true" />
          <span>Viaggi</span>
        </NavLink>
      </nav>
    </div>
  )
}
