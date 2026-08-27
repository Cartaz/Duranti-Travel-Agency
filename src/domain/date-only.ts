export function normalizeDateOnly(value: string, label: string): string {
  const date = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${label} non è valida.`)

  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} non esiste nel calendario.`)
  }
  return date
}

export function normalizeOptionalDateOnly(value: string | undefined, label: string): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? normalizeDateOnly(cleaned, label) : undefined
}
