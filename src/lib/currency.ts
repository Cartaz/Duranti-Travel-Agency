export function normalizeCurrencyCode(value: string): string {
  const currency = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('La valuta deve essere un codice ISO di tre lettere, ad esempio EUR.')
  }

  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(0)
  } catch {
    throw new Error('La valuta indicata non è supportata dal dispositivo.')
  }

  return currency
}

export function currencyFractionDigits(currencyInput: string): number {
  const currency = normalizeCurrencyCode(currencyInput)
  const { minimumFractionDigits } = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).resolvedOptions()

  if (typeof minimumFractionDigits !== 'number') {
    throw new Error(`Impossibile determinare i decimali della valuta ${currency}.`)
  }

  return minimumFractionDigits
}

export function majorAmountToMinor(amountInput: string, currencyInput: string): number {
  const currency = normalizeCurrencyCode(currencyInput)
  const digits = currencyFractionDigits(currency)
  const amount = amountInput.trim().replace(',', '.')

  if (!/^\d+(?:\.\d+)?$/.test(amount)) {
    throw new Error('Inserisci un importo valido, ad esempio 12,50.')
  }

  const [whole, fraction = ''] = amount.split('.')
  if (fraction.length > digits) {
    throw new Error(`La valuta ${currency} ammette al massimo ${digits} cifre decimali.`)
  }

  const factor = 10n ** BigInt(digits)
  const fractionMinor = digits === 0
    ? 0n
    : BigInt((fraction + '0'.repeat(digits)).slice(0, digits))
  const minor = BigInt(whole) * factor + fractionMinor

  if (minor <= 0n) throw new Error('L’importo deve essere maggiore di zero.')
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('L’importo è troppo grande.')

  return Number(minor)
}

export function minorAmountToMajor(amountMinor: number, currencyInput: string): string {
  const currency = normalizeCurrencyCode(currencyInput)
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error('Importo persistito non valido.')
  }

  const digits = currencyFractionDigits(currency)
  if (digits === 0) return String(amountMinor)

  const factor = 10n ** BigInt(digits)
  const minor = BigInt(amountMinor)
  const whole = minor / factor
  const fraction = String(minor % factor).padStart(digits, '0')
  return `${whole}.${fraction}`
}

export function formatMinorCurrency(
  amountMinor: number,
  currencyInput: string,
  locale = 'it-IT',
): string {
  const currency = normalizeCurrencyCode(currencyInput)
  const digits = currencyFractionDigits(currency)
  const divisor = 10 ** digits
  return new Intl.NumberFormat(locale, { style: 'currency', currency })
    .format(amountMinor / divisor)
}
