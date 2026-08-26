import { useRef, useState, type FormEvent } from 'react'
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

  const placeholder = control.getAttribute('placeholder')?.trim()
  if (placeholder) return placeholder

  return control.name || 'questo campo'
}

function formatDateConstraint(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function constraintValue(control: ValidatableControl, value: string): string {
  if (!(control instanceof HTMLInputElement)) return value
  if (control.type === 'date') return formatDateConstraint(value)
  if (control.type === 'time') return value
  if (control.type === 'datetime-local') {
    const [date, time] = value.split('T')
    return time ? `${formatDateConstraint(date)}, ${time}` : formatDateConstraint(date)
  }
  return value
}

function readableValidationMessage(control: ValidatableControl): string {
  const label = controlLabel(control)
  const { validity } = control

  if (validity.valueMissing) return `Compila “${label}”.`
  if (validity.typeMismatch) return `Controlla “${label}”: il formato inserito non è valido.`
  if (validity.patternMismatch) return `Controlla “${label}”: il valore non rispetta il formato richiesto.`
  if (validity.tooShort) return `“${label}” è troppo corto.`
  if (validity.tooLong) return `“${label}” è troppo lungo.`
  if (validity.rangeUnderflow) {
    const minimum = control instanceof HTMLInputElement ? control.min : ''
    return minimum
      ? `“${label}” non può essere prima di ${constraintValue(control, minimum)}.`
      : `“${label}” è inferiore al valore minimo consentito.`
  }
  if (validity.rangeOverflow) {
    const maximum = control instanceof HTMLInputElement ? control.max : ''
    return maximum
      ? `“${label}” non può essere oltre ${constraintValue(control, maximum)}.`
      : `“${label}” supera il valore massimo consentito.`
  }
  if (validity.stepMismatch) return `Controlla “${label}”: il valore non è ammesso.`
  if (validity.badInput) return `Controlla “${label}”: il valore inserito non può essere letto.`

  return control.validationMessage || `Controlla “${label}”.`
}

export default function AppShell() {
  const [validationNotice, setValidationNotice] = useState('')
  const validationLockRef = useRef(false)

  const handleInvalid = (event: FormEvent<HTMLElement>): void => {
    event.preventDefault()
    const target = event.target
    if (!(target instanceof HTMLInputElement)
      && !(target instanceof HTMLTextAreaElement)
      && !(target instanceof HTMLSelectElement)) return

    if (validationLockRef.current) return
    validationLockRef.current = true
    window.requestAnimationFrame(() => {
      validationLockRef.current = false
    })

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
        <NavLink to="/" className="app-brand" aria-label="DTAgency — viaggi">
          <span className="app-brand-mark" aria-hidden="true">DT</span>
          <span>
            <strong>DTAgency</strong>
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
        <NavLink to="/places" className={navClassName}>
          <span className="nav-glyph" aria-hidden="true">⌖</span>
          <span>Luoghi</span>
        </NavLink>
        <NavLink to="/backup" className={navClassName}>
          <span className="nav-glyph" aria-hidden="true">↥</span>
          <span>Backup</span>
        </NavLink>
      </nav>
    </div>
  )
}
