import type { Block, Expense, Traveler } from '../../domain/entities'
import { expenseBlockRepository } from '../../data/repositories/expense-block-repository'
import { blockRepository, expenseRepository } from '../../data/repositories/repositories'
import { getTripDay } from '../days/day-service'
import { assertPlannerDayContext } from '../planner/block-service'
import { getTraveler, listTripParticipants } from '../travelers/traveler-service'
import {
  majorAmountToMinor,
  minorAmountToMajor,
  normalizeCurrencyCode,
} from './currency'

export interface ExpenseDraft {
  amount: string
  currency: string
  category?: string
  description?: string
  occurredAt?: string
  paidByTravelerId?: string
  notes?: string
}

export function emptyExpenseDraft(currency = 'EUR'): ExpenseDraft {
  return {
    amount: '',
    currency: normalizeCurrencyCode(currency),
  }
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

function validateOptionalText(value: string | undefined, label: string, maxLength: number): string | undefined {
  const cleaned = cleanOptional(value)
  if (cleaned && cleaned.length > maxLength) throw new Error(`${label}: valore troppo lungo.`)
  return cleaned
}

function validateLocalDateTime(value: string | undefined, dayDate: string): string | undefined {
  const cleaned = cleanOptional(value)
  if (!cleaned) return undefined
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cleaned)) {
    throw new Error('Data e ora della spesa non valide.')
  }

  const [date, time] = cleaned.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    hour < 0 || hour > 23 || minute < 0 || minute > 59
  ) {
    throw new Error('Data e ora della spesa non esistono nel calendario.')
  }
  if (date !== dayDate) {
    throw new Error('La spesa deve cadere nella giornata a cui è collegata.')
  }

  return cleaned
}

function expenseIdFromBlock(block: Block): string | undefined {
  const value = block.content.expenseId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il riferimento alla spesa del blocco non è valido.')
  return value
}

async function getExpenseBlock(tripId: string, dayId: string, blockId: string): Promise<Block> {
  const block = await blockRepository.get(blockId)
  if (!block || block.tripId !== tripId || block.dayId !== dayId || block.type !== 'expense') {
    throw new Error('Il blocco spesa non appartiene a questa giornata.')
  }
  return block
}

function assertExpenseContext(expense: Expense, tripId: string, dayId: string): void {
  if (expense.tripId !== tripId || expense.dayId !== dayId) {
    throw new Error('La spesa collegata non appartiene a questo blocco.')
  }
}

async function validatePayer(
  tripId: string,
  requestedTravelerId: string | undefined,
  currentTravelerId: string | undefined,
): Promise<string | undefined> {
  const travelerId = cleanOptional(requestedTravelerId)
  if (!travelerId) return undefined

  // Preserve the historical payer of an existing expense even if that person was
  // later detached from the trip. Choosing a different payer still requires an
  // active trip membership.
  if (travelerId === currentTravelerId) return travelerId

  const participants = await listTripParticipants(tripId)
  if (!participants.some((participant) => participant.traveler.id === travelerId)) {
    throw new Error('“Pagato da” deve riferirsi a un viaggiatore attualmente associato al viaggio.')
  }
  return travelerId
}

export function expenseToDraft(expense: Expense): ExpenseDraft {
  return {
    amount: minorAmountToMajor(expense.amountMinor, expense.currency),
    currency: expense.currency,
    category: expense.category,
    description: expense.description,
    occurredAt: expense.occurredAt,
    paidByTravelerId: expense.paidByTravelerId,
    notes: expense.notes,
  }
}

export async function listExpensePayerOptions(
  tripId: string,
  currentTravelerId?: string,
): Promise<{ active: Traveler[]; historical?: Traveler }> {
  const participants = await listTripParticipants(tripId)
  const active = participants.map((participant) => participant.traveler)
  const currentIsActive = currentTravelerId
    ? active.some((traveler) => traveler.id === currentTravelerId)
    : false
  const historical = currentTravelerId && !currentIsActive
    ? await getTraveler(currentTravelerId)
    : undefined

  return {
    active: active.sort((left, right) => left.displayName.localeCompare(right.displayName, 'it')),
    historical,
  }
}

export async function getPlannerExpense(
  tripId: string,
  dayId: string,
  blockId: string,
): Promise<Expense | undefined> {
  await assertPlannerDayContext(tripId, dayId, false)
  const block = await getExpenseBlock(tripId, dayId, blockId)
  const expenseId = expenseIdFromBlock(block)
  if (!expenseId) return undefined

  const expense = await expenseRepository.get(expenseId)
  if (!expense) return undefined
  assertExpenseContext(expense, tripId, dayId)
  return expense
}

export async function savePlannerExpense(
  tripId: string,
  dayId: string,
  blockId: string,
  input: ExpenseDraft,
): Promise<Expense> {
  await assertPlannerDayContext(tripId, dayId, true)
  const block = await getExpenseBlock(tripId, dayId, blockId)
  const day = await getTripDay(tripId, dayId)
  if (!day) throw new Error('La giornata non esiste più.')

  const currency = normalizeCurrencyCode(input.currency)
  const amountMinor = majorAmountToMinor(input.amount, currency)
  const expenseId = expenseIdFromBlock(block)
  const current = expenseId ? await expenseRepository.get(expenseId) : undefined
  if (current) assertExpenseContext(current, tripId, dayId)

  const paidByTravelerId = await validatePayer(tripId, input.paidByTravelerId, current?.paidByTravelerId)
  const now = new Date().toISOString()
  const common = {
    amountMinor,
    currency,
    category: validateOptionalText(input.category, 'Categoria', 80),
    description: validateOptionalText(input.description, 'Descrizione', 500),
    occurredAt: validateLocalDateTime(input.occurredAt, day.date),
    paidByTravelerId,
    notes: validateOptionalText(input.notes, 'Note', 2000),
  }

  const expense: Expense = current
    ? {
        ...current,
        ...common,
        tripId,
        dayId,
        updatedAt: now,
      }
    : {
        id: crypto.randomUUID(),
        ...common,
        tripId,
        dayId,
        createdAt: now,
        updatedAt: now,
      }

  await expenseBlockRepository.saveExpenseForBlock(blockId, tripId, dayId, expense)
  return expense
}

export async function deletePlannerExpenseBlock(
  tripId: string,
  dayId: string,
  blockId: string,
): Promise<void> {
  await assertPlannerDayContext(tripId, dayId, true)
  await expenseBlockRepository.softDeleteExpenseBlock(blockId, tripId, dayId)
}
