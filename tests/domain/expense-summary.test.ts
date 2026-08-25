import assert from 'node:assert/strict'
import test from 'node:test'
import { createExpenseSummaryApplication } from '../../src/application/expenses/expense-summary.ts'
import type { Expense, Traveler, Trip } from '../../src/domain/entities.ts'

const timestamp = '2026-08-25T12:00:00.000Z'

function traveler(id: string, displayName: string): Traveler {
  const [firstName, lastName] = displayName.split(' ')
  return { id, firstName, lastName, displayName, createdAt: timestamp, updatedAt: timestamp }
}

test('expense summary resolves payer profiles with one batch lookup', async () => {
  const trip: Trip = {
    id: 'trip-1', title: 'Budget trip', status: 'planned', createdAt: timestamp, updatedAt: timestamp,
  }
  const expenses: Expense[] = [
    { id: 'expense-a', tripId: trip.id, amountMinor: 1200, currency: 'EUR', paidByTravelerId: 'traveler-a', createdAt: timestamp, updatedAt: timestamp },
    { id: 'expense-b', tripId: trip.id, amountMinor: 800, currency: 'EUR', paidByTravelerId: 'traveler-b', createdAt: timestamp, updatedAt: timestamp },
    { id: 'expense-a-2', tripId: trip.id, amountMinor: 500, currency: 'EUR', paidByTravelerId: 'traveler-a', createdAt: timestamp, updatedAt: timestamp },
  ]
  const profiles = new Map([
    ['traveler-a', traveler('traveler-a', 'Anna Rossi')],
    ['traveler-b', traveler('traveler-b', 'Bruno Bianchi')],
  ])
  const requestedIds: string[][] = []

  const application = createExpenseSummaryApplication({
    trips: { get: async (id) => id === trip.id ? trip : undefined },
    days: { listByTrip: async () => [] },
    expenses: { listByTrip: async () => expenses },
    travelers: {
      getMany: async (ids) => {
        requestedIds.push([...ids])
        return ids.map((id) => profiles.get(id)).filter((item): item is Traveler => Boolean(item))
      },
    },
  })

  const summary = await application.getTripExpenseSummary(trip.id)

  assert.deepEqual(requestedIds, [['traveler-a', 'traveler-b']])
  assert.deepEqual(summary.currencies[0]?.payers.map((payer) => payer.label), ['Anna Rossi', 'Bruno Bianchi'])
})

test('expense summary preserves fallback label when a batch profile is missing', async () => {
  const trip: Trip = {
    id: 'trip-1', title: 'Budget trip', status: 'planned', createdAt: timestamp, updatedAt: timestamp,
  }
  const expense: Expense = {
    id: 'expense-missing', tripId: trip.id, amountMinor: 1000, currency: 'EUR', paidByTravelerId: 'traveler-missing', createdAt: timestamp, updatedAt: timestamp,
  }

  const application = createExpenseSummaryApplication({
    trips: { get: async () => trip },
    days: { listByTrip: async () => [] },
    expenses: { listByTrip: async () => [expense] },
    travelers: { getMany: async () => [] },
  })

  const summary = await application.getTripExpenseSummary(trip.id)
  assert.equal(summary.currencies[0]?.payers[0]?.label, 'Profilo non disponibile')
})
