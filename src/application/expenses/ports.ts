import type { Block, Day, Expense, Traveler, Trip } from '../../domain/entities'

export interface ExpenseTripPort { get(id: string): Promise<Trip | undefined> }
export interface ExpenseDayPort { get(id: string): Promise<Day | undefined> }
export interface ExpenseBlockPort { get(id: string): Promise<Block | undefined> }
export interface ExpenseRepositoryPort { get(id: string): Promise<Expense | undefined> }
export interface ExpenseTravelerPort {
  getTraveler(id: string): Promise<Traveler | undefined>
  listActiveTripTravelers(tripId: string): Promise<Traveler[]>
}
export interface ExpenseBlockTransactionPort {
  saveExpenseForBlock(blockId: string, tripId: string, dayId: string, expense: Expense): Promise<void>
  softDeleteExpenseBlock(blockId: string, tripId: string, dayId: string): Promise<void>
}

export interface ExpenseApplicationDependencies {
  trips: ExpenseTripPort
  days: ExpenseDayPort
  blocks: ExpenseBlockPort
  expenses: ExpenseRepositoryPort
  travelers: ExpenseTravelerPort
  blockTransactions: ExpenseBlockTransactionPort
  now(): string
  newId(): string
}
