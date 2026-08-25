import { createExpenseApplication } from '../application/expenses/expense-application'
import { createExpenseSummaryApplication } from '../application/expenses/expense-summary'
import { expenseBlockRepository } from '../data/repositories/expense-block-repository'
import {
  blockRepository,
  dayRepository,
  expenseRepository,
  travelerRepository,
  tripRepository,
  tripTravelerRepository,
} from '../data/repositories/repositories'

const expenseCommands = createExpenseApplication({
  trips: tripRepository,
  days: dayRepository,
  blocks: blockRepository,
  expenses: expenseRepository,
  blockTransactions: expenseBlockRepository,
  travelers: {
    getTraveler: (travelerId) => travelerRepository.get(travelerId),
    async listActiveTripTravelers(tripId) {
      const memberships = await tripTravelerRepository.listActiveForTrip(tripId)
      const travelers = await Promise.all(memberships.map((membership) => travelerRepository.get(membership.travelerId)))
      return travelers.filter((traveler): traveler is NonNullable<typeof traveler> => Boolean(traveler))
    },
  },
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
})

const expenseSummary = createExpenseSummaryApplication({
  trips: tripRepository,
  days: dayRepository,
  expenses: expenseRepository,
  travelers: travelerRepository,
})

export const expenseApplication = { ...expenseCommands, ...expenseSummary }
