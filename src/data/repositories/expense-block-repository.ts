import type { Block, Expense } from '../../domain/entities'
import { db } from '../db/duranti-db'

function readExpenseId(block: Block): string | undefined {
  const value = block.content.expenseId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il riferimento alla spesa non è valido.')
  return value
}

function assertExpenseContext(expense: Expense, tripId: string, dayId: string): void {
  if (expense.tripId !== tripId || expense.dayId !== dayId) {
    throw new Error('La spesa collegata non appartiene a questo blocco.')
  }
}

export class ExpenseBlockRepository {
  async saveExpenseForBlock(
    blockId: string,
    tripId: string,
    dayId: string,
    expense: Expense,
  ): Promise<void> {
    await db.transaction('rw', db.blocks, db.expenses, async () => {
      const block = await db.blocks.get(blockId)
      if (!block || block.deletedAt) throw new Error('Il blocco spesa non esiste più.')
      if (block.tripId !== tripId || block.dayId !== dayId || block.type !== 'expense') {
        throw new Error('Il blocco spesa non appartiene a questa giornata.')
      }
      assertExpenseContext(expense, tripId, dayId)

      const currentExpenseId = readExpenseId(block)
      const currentExpense = currentExpenseId ? await db.expenses.get(currentExpenseId) : undefined
      if (currentExpense && !currentExpense.deletedAt) {
        assertExpenseContext(currentExpense, tripId, dayId)
        if (currentExpense.id !== expense.id) {
          throw new Error('Il blocco è già collegato a un’altra spesa attiva.')
        }
      }

      const target = await db.expenses.get(expense.id)
      if (target?.deletedAt && !expense.deletedAt) {
        throw new Error('La spesa è stata eliminata e non può essere riattivata implicitamente.')
      }
      if (target && target.id !== currentExpense?.id) {
        throw new Error('Esiste già un’altra spesa con questo identificatore.')
      }

      if (target) await db.expenses.put(expense)
      else await db.expenses.add(expense)

      await db.blocks.put({
        ...block,
        content: {
          ...block.content,
          expenseId: expense.id,
        },
        updatedAt: new Date().toISOString(),
      })
    })
  }

  async softDeleteExpenseBlock(blockId: string, tripId: string, dayId: string): Promise<void> {
    await db.transaction('rw', db.blocks, db.expenses, async () => {
      const block = await db.blocks.get(blockId)
      if (!block || block.deletedAt) return
      if (block.tripId !== tripId || block.dayId !== dayId || block.type !== 'expense') {
        throw new Error('Il blocco spesa non appartiene a questa giornata.')
      }

      const now = new Date().toISOString()
      const expenseId = readExpenseId(block)
      if (expenseId) {
        const expense = await db.expenses.get(expenseId)
        if (expense && !expense.deletedAt) {
          assertExpenseContext(expense, tripId, dayId)
          await db.expenses.put({
            ...expense,
            deletedAt: now,
            updatedAt: now,
          })
        }
      }

      await db.blocks.put({
        ...block,
        deletedAt: now,
        updatedAt: now,
      })
    })
  }
}

export const expenseBlockRepository = new ExpenseBlockRepository()
