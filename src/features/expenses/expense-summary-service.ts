import { dayRepository, expenseRepository, travelerRepository, tripRepository } from '../../data/repositories/repositories'
import type { Day, Expense } from '../../domain/entities'

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
  days: ExpenseSummarySlice[]
}

export interface TripBudgetSummary {
  currency: string
  budgetMinor: number
  spentMinor: number
  remainingMinor: number
  exceededMinor: number
  includedExpenseCount: number
  directExpenseCount: number
  convertedExpenseCount: number
  excludedExpenseCount: number
}

export interface TripExpenseSummary {
  expenseCount: number
  currencies: ExpenseCurrencySummary[]
  budget?: TripBudgetSummary
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
  days: Map<string, MutableSlice>
}

const UNASSIGNED_DAY_KEY = '__unassigned__'
const MISSING_DAY_PREFIX = '__missing__:'

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

function formatDayLabel(day: Day): string {
  const detail = day.title?.trim() || day.date
  return `Giorno ${day.sequence} · ${detail}`
}

function finalizeDaySlices(map: Map<string, MutableSlice>, dayById: Map<string, Day>): ExpenseSummarySlice[] {
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => {
      const leftDay = dayById.get(left.key)
      const rightDay = dayById.get(right.key)

      if (leftDay && rightDay) {
        return leftDay.sequence - rightDay.sequence
          || leftDay.date.localeCompare(rightDay.date)
          || left.label.localeCompare(right.label, 'it')
      }
      if (leftDay) return -1
      if (rightDay) return 1

      const leftUnassigned = left.key === UNASSIGNED_DAY_KEY
      const rightUnassigned = right.key === UNASSIGNED_DAY_KEY
      if (leftUnassigned !== rightUnassigned) return leftUnassigned ? 1 : -1

      return left.label.localeCompare(right.label, 'it')
    })
}

function summarizeBudgetExpenses(expenses: Expense[], currency: string): {
  spentMinor: number
  directExpenseCount: number
  convertedExpenseCount: number
  excludedExpenseCount: number
} {
  let spentMinor = 0
  let directExpenseCount = 0
  let convertedExpenseCount = 0
  let excludedExpenseCount = 0

  for (const expense of expenses) {
    if (expense.currency === currency) {
      spentMinor = addMinor(spentMinor, expense.amountMinor)
      directExpenseCount += 1
      continue
    }

    if (expense.fx?.targetCurrency === currency) {
      if (!Number.isSafeInteger(expense.fx.convertedAmountMinor) || expense.fx.convertedAmountMinor <= 0) {
        throw new Error('Una conversione FX persistita contiene un importo non valido.')
      }
      if (!expense.fx.rate || typeof expense.fx.rate !== 'string') {
        throw new Error('Una conversione FX persistita non contiene un tasso valido.')
      }
      spentMinor = addMinor(spentMinor, expense.fx.convertedAmountMinor)
      convertedExpenseCount += 1
      continue
    }

    excludedExpenseCount += 1
  }

  return { spentMinor, directExpenseCount, convertedExpenseCount, excludedExpenseCount }
}

export async function getTripExpenseSummary(tripId: string): Promise<TripExpenseSummary> {
  const [trip, expenses] = await Promise.all([
    tripRepository.get(tripId),
    expenseRepository.list().then((items) => items.filter((expense) => expense.tripId === tripId)),
  ])
  if (!trip) throw new Error('Il viaggio non esiste o è stato eliminato.')

  const [tripDays, payerIds] = await Promise.all([
    dayRepository.list().then((days) => days.filter((day) => day.tripId === tripId)),
    Promise.resolve(Array.from(new Set(
      expenses
        .map((expense) => expense.paidByTravelerId)
        .filter((travelerId): travelerId is string => Boolean(travelerId)),
    ))),
  ])
  const dayById = new Map(tripDays.map((day) => [day.id, day]))

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
        days: new Map(),
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

    if (expense.dayId) {
      const day = dayById.get(expense.dayId)
      if (day) {
        addSlice(currency.days, day.id, formatDayLabel(day), expense.amountMinor)
      } else {
        addSlice(
          currency.days,
          `${MISSING_DAY_PREFIX}${expense.dayId}`,
          'Giorno non disponibile',
          expense.amountMinor,
        )
      }
    } else {
      addSlice(currency.days, UNASSIGNED_DAY_KEY, 'Senza giorno', expense.amountMinor)
    }
  }

  const currencies = Array.from(grouped.entries())
    .map(([currency, value]) => ({
      currency,
      totalMinor: value.totalMinor,
      count: value.count,
      categories: finalizeSlices(value.categories),
      payers: finalizeSlices(value.payers),
      days: finalizeDaySlices(value.days, dayById),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency))

  let budget: TripBudgetSummary | undefined
  if (trip.budgetMinor !== undefined) {
    if (!Number.isSafeInteger(trip.budgetMinor) || trip.budgetMinor <= 0) {
      throw new Error('Il viaggio contiene un budget persistito non valido.')
    }
    const currency = trip.currency?.trim().toUpperCase()
    if (!currency) throw new Error('Il viaggio ha un budget ma non una valuta associata.')

    const budgetExpenses = summarizeBudgetExpenses(expenses, currency)
    budget = {
      currency,
      budgetMinor: trip.budgetMinor,
      spentMinor: budgetExpenses.spentMinor,
      remainingMinor: budgetExpenses.spentMinor < trip.budgetMinor ? trip.budgetMinor - budgetExpenses.spentMinor : 0,
      exceededMinor: budgetExpenses.spentMinor > trip.budgetMinor ? budgetExpenses.spentMinor - trip.budgetMinor : 0,
      includedExpenseCount: budgetExpenses.directExpenseCount + budgetExpenses.convertedExpenseCount,
      directExpenseCount: budgetExpenses.directExpenseCount,
      convertedExpenseCount: budgetExpenses.convertedExpenseCount,
      excludedExpenseCount: budgetExpenses.excludedExpenseCount,
    }
  }

  return {
    expenseCount: expenses.length,
    currencies,
    budget,
  }
}
