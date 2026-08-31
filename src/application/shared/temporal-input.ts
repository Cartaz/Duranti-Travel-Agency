function cleaned(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export function validateLocalDateTimeInput(value: string | undefined, label: string): string | undefined {
  const normalized = cleaned(value)
  if (!normalized) return undefined
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) throw new Error(`${label}: data e ora non valide.`)

  const [date, time] = normalized.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    hour < 0 || hour > 23 || minute < 0 || minute > 59
  ) {
    throw new Error(`${label}: data e ora non esistono nel calendario.`)
  }
  return normalized
}

export function validateIanaTimezoneInput(value: string | undefined): string | undefined {
  const normalized = cleaned(value)
  if (!normalized) return undefined
  if (normalized.length > 100) throw new Error('Fuso orario: valore troppo lungo.')
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date())
  } catch {
    throw new Error('Il fuso orario non è valido. Usa un nome IANA, ad esempio Europe/Paris.')
  }
  return normalized
}
