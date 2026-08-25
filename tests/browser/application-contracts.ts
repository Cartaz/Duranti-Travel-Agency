import type { Day, Expense, Trip } from '../../src/domain/entities'
import { createDayApplication } from '../../src/application/days/day-application'
import { createExpenseSummaryApplication } from '../../src/application/expenses/expense-summary'
import { createTripApplication } from '../../src/application/trips/trip-application'

export interface ApplicationContractResult {
  name: string
  ok: boolean
  error?: string
}

function resultError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

async function contract(name: string, test: () => Promise<void>): Promise<ApplicationContractResult> {
  try {
    await test()
    return { name, ok: true }
  } catch (error) {
    return { name, ok: false, error: resultError(error) }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function runApplicationContractTests(): Promise<ApplicationContractResult[]> {
  const results: ApplicationContractResult[] = []

  results.push(await contract('Trip use case rejects a date range that would strand an existing day', async () => {
    const timestamp = '2026-08-25T12:00:00.000Z'
    const trip: Trip = {
      id: 'trip-1',
      title: 'Strategic trip',
      status: 'planned',
      startDate: '2026-09-01',
      endDate: '2026-09-10',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const days: Day[] = [{
      id: 'day-1',
      tripId: trip.id,
      sequence: 1,
      date: '2026-09-08',
      createdAt: timestamp,
      updatedAt: timestamp,
    }]
    let stored = trip

    const application = createTripApplication({
      trips: {
        listBookTrips: async () => [stored],
        listArchivedTrips: async () => [],
        get: async (id) => id === stored.id ? stored : undefined,
        put: async (value) => { stored = value; return value.id },
      },
      days: {
        listByTrip: async (tripId) => days.filter((day) => day.tripId === tripId),
      },
      now: () => '2026-08-25T13:00:00.000Z',
      newId: () => 'new-trip',
    })

    let rejected = false
    try {
      await application.updateTrip(trip.id, {
        title: trip.title,
        status: 'planned',
        startDate: '2026-09-01',
        endDate: '2026-09-05',
      })
    } catch (error) {
      rejected = error instanceof Error && error.message.includes('resterebbe fuori')
    }

    assert(rejected, 'Trip update did not reject a range excluding an existing day.')
    assert(stored.endDate === '2026-09-10', 'Rejected trip update mutated persisted state.')
  }))

  results.push(await contract('Day use case assigns the next sequence using only days from its trip', async () => {
    const timestamp = '2026-08-25T12:00:00.000Z'
    const trip: Trip = {
      id: 'trip-1',
      title: 'Strategic trip',
      status: 'planned',
      startDate: '2026-09-01',
      endDate: '2026-09-10',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const tripDays: Day[] = [{
      id: 'day-1',
      tripId: trip.id,
      sequence: 3,
      date: '2026-09-03',
      createdAt: timestamp,
      updatedAt: timestamp,
    }]
    let saved: Day | undefined

    const application = createDayApplication({
      trips: { getTrip: async (tripId) => tripId === trip.id ? trip : undefined },
      days: {
        listByTrip: async (tripId) => tripId === trip.id ? [...tripDays] : [],
        get: async () => undefined,
        put: async (value) => { saved = value; return value.id },
      },
      now: () => '2026-08-25T13:00:00.000Z',
      newId: () => 'day-new',
    })

    const created = await application.createTripDay(trip.id, { date: '2026-09-04', title: 'Fourth day' })
    assert(created.sequence === 4, `Expected sequence 4, got ${created.sequence}.`)
    assert(saved?.id === created.id, 'Created day was not persisted through the port.')
  }))

  results.push(await contract('Expense summary includes explicit FX conversions in trip budget', async () => {
    const timestamp = '2026-08-25T12:00:00.000Z'
    const trip: Trip = {
      id: 'trip-1',
      title: 'Budget trip',
      status: 'planned',
      currency: 'EUR',
      budgetMinor: 20_000,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const expenses: Expense[] = [
      {
        id: 'expense-eur',
        tripId: trip.id,
        amountMinor: 5_000,
        currency: 'EUR',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'expense-usd',
        tripId: trip.id,
        amountMinor: 10_000,
        currency: 'USD',
        fx: { targetCurrency: 'EUR', rate: '0.9', convertedAmountMinor: 9_000 },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'expense-gbp',
        tripId: trip.id,
        amountMinor: 2_000,
        currency: 'GBP',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]

    const application = createExpenseSummaryApplication({
      trips: { get: async (id) => id === trip.id ? trip : undefined },
      days: { listByTrip: async () => [] },
      expenses: { listByTrip: async (id) => id === trip.id ? expenses : [] },
      travelers: { get: async () => undefined },
    })

    const summary = await application.getTripExpenseSummary(trip.id)
    assert(summary.budget?.spentMinor === 14_000, `Expected budget spend 14000, got ${summary.budget?.spentMinor}.`)
    assert(summary.budget?.remainingMinor === 6_000, `Expected remaining budget 6000, got ${summary.budget?.remainingMinor}.`)
    assert(summary.budget?.directExpenseCount === 1, 'Direct expense count is incorrect.')
    assert(summary.budget?.convertedExpenseCount === 1, 'Converted expense count is incorrect.')
    assert(summary.budget?.excludedExpenseCount === 1, 'Unconverted foreign expense was not excluded.')
  }))

  return results
}
