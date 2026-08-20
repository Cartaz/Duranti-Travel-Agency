import { expenseRepository, travelerRepository } from '../../data/repositories/repositories'

export interface ExpenseSummarySlice {
  key: string
  label: string
  totalMinor: number
  count: number
}

export interface ExpenseCurrencySummary {
  currency: string
  totalMinor: number
  count: number
  categories: ExpenseSummarySlice[]
  payers: ExpenseSummarySlice[]
}

export interface TripExpenseSummary {
  expenseCount: number
  currencies: ExpenseCurrencySummary[]
}

interface MutableSlice {
  label: string
  totalMinor: number
  count: number
}

interface MutableCurrencySummary {
  totalMinor: number
  count: number
  categories: Map<string, MutableSlice>
  payers: Map<string, MutableSlice>
}

function addMinor(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || right < 0) {
    throw new Error('Il riepilogo contiene un importo persistito non valido.')
  }
  const total = left + right
  if (!Number.isSafeInteger(total)) throw new Error('Il totale delle spese supera il limite numerico sicuro.')
  return total
}

function addSlice(map: Map<string, MutableSlice>, key: string, label: string, amountMinor: number): void {
  const current = map.get(key)
  if (current) {
    current.totalMinor = addMinor(current.totalMinor, amountMinor)
    current.count += 1
    return
  }
  map.set(key, { label, totalMinor: amountMinor, count: 1 })
}

function finalizeSlices(map: Map<string, MutableSlice>): ExpenseSummarySlice[] {
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => right.totalMinor - left.totalMinor || left.label.localeCompare(right.label, 'it'))
}

export async function getTripExpenseSummary(tripId: string): Promise<TripExpenseSummary> {
  const expenses = (await expenseRepository.list()).filter((expense) => expense.tripId === tripId)
  if (expenses.length === 0) return { expenseCount: 0, currencies: [] }

  const payerIds = Array.from(new Set(
    expenses
      .map((expense) => expense.paidByTravelerId)
      .filter((travelerId): travelerId is string => Boolean(travelerId)),
  ))
  const payerNames = new Map<string, string>()
  await Promise.all(payerIds.map(async (travelerId) => {
    const traveler = await travelerRepository.get(travelerId)
    payerNames.set(travelerId, traveler?.displayName ?? 'Profilo non disponibile')
  }))

  const grouped = new Map<string, MutableCurrencySummary>()
  for (const expense of expenses) {
    if (!Number.isSafeInteger(expense.amountMinor) || expense.amountMinor < 0) {
      throw new Error('Il riepilogo contiene una spesa con importo non valido.')
    }

    let currency = grouped.get(expense.currency)
    if (!currency) {
      currency = {
        totalMinor: 0,
        count: 0,
        categories: new Map(),
        payers: new Map(),
      }
      grouped.set(expense.currency, currency)
    }

    currency.totalMinor = addMinor(currency.totalMinor, expense.amountMinor)
    currency.count += 1

    const category = expense.category?.trim() || 'Senza categoria'
    addSlice(currency.categories, category.toLocaleLowerCase('it'), category, expense.amountMinor)

    if (expense.paidByTravelerId) {
      addSlice(
        currency.payers,
        expense.paidByTravelerId,
        payerNames.get(expense.paidByTravelerId) ?? 'Profilo non disponibile',
        expense.amountMinor,
      )
    } else {
      addSlice(currency.payers, '__unspecified__', 'Non specificato', expense.amountMinor)
    }
  }

  const currencies = Array.from(grouped.entries())
    .map(([currency, value]) => ({
      currency,
      totalMinor: value.totalMinor,
      count: value.count,
      categories: finalizeSlices(value.categories),
      payers: finalizeSlices(value.payers),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency))

  return {
    expenseCount: expenses.length,
    currencies,
  }
}
