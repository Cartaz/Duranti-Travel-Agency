import type { Expense } from '../../domain/entities'
import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'

export class ExpenseRepository extends Repository<Expense> {
  constructor() {
    super(db.expenses)
  }

  async listByTrip(tripId: string): Promise<Expense[]> {
    return (await db.expenses.where('tripId').equals(tripId).toArray())
      .filter((expense) => !expense.deletedAt)
  }
}

export const expenseRepository = new ExpenseRepository()
