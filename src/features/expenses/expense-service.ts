import type { Block, Expense, ExpenseFxConversion, Traveler } from '../../domain/entities'
import { assertTripDayContext } from '../../application/shared/trip-day-context'
import { expenseBlockRepository } from '../../data/repositories/expense-block-repository'
import { blockRepository, dayRepository, expenseRepository, tripRepository } from '../../data/repositories/repositories'
import { getTraveler, listTripParticipants } from '../travelers/traveler-service'
import {
  convertMinorByRate,
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
  fxRate?: string
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

function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function validateLocalDateTime(value: string | undefined, dayDate: string): string | undefined {
  const cleaned = cleanOptional(value)
  if (!cleaned) return undefined
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cleaned)) {
    throw new Error('Ora della spesa non valida. Inserisci un orario nel formato ore:minuti.')
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
    throw new Error('Ora della spesa non valida: controlla ore e minuti.')
  }
  if (date !== dayDate) {
    throw new Error(
      `Data della spesa non valida: questa spesa appartiene alla giornata del ${formatDisplayDate(dayDate)}, `
      + `non al ${formatDisplayDate(date)}. Modifica solo l’ora oppure sposta la spesa nella giornata corretta.`,
    )
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
  if (travelerId === currentTravelerId) return travelerId

  const participants = await listTripParticipants(tripId)
  if (!participants.some((participant) => participant.traveler.id === travelerId)) {
    throw new Error('“Pagato da” deve riferirsi a un viaggiatore attualmente associato al viaggio.')
  }
  return travelerId
}

async function assertExpenseDayContext(tripId: string, dayId: string, editable: boolean) {
  return assertTripDayContext(
    { trips: tripRepository, days: dayRepository },
    tripId,
    dayId,
    editable,
    'Ripristina il viaggio prima di modificare le spese.',
  )
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
    fxRate: expense.fx?.rate,
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
  await assertExpenseDayContext(tripId, dayId, false)
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
  const { trip, day } = await assertExpenseDayContext(tripId, dayId, true)
  const block = await getExpenseBlock(tripId, dayId, blockId)

  const currency = normalizeCurrencyCode(input.currency)
  const amountMinor = majorAmountToMinor(input.amount, currency)
  const expenseId = expenseIdFromBlock(block)
  const current = expenseId ? await expenseRepository.get(expenseId) : undefined
  if (current) assertExpenseContext(current, tripId, dayId)

  const paidByTravelerId = await validatePayer(tripId, input.paidByTravelerId, current?.paidByTravelerId)
  const tripCurrency = trip.currency ? normalizeCurrencyCode(trip.currency) : undefined
  const requestedFxRate = cleanOptional(input.fxRate)
  let fx: ExpenseFxConversion | undefined

  if (tripCurrency && currency !== tripCurrency && requestedFxRate) {
    const conversion = convertMinorByRate(amountMinor, currency, tripCurrency, requestedFxRate)
    fx = {
      targetCurrency: tripCurrency,
      rate: conversion.rate,
      convertedAmountMinor: conversion.convertedAmountMinor,
    }
  } else if (!tripCurrency && requestedFxRate) {
    throw new Error('Imposta prima la valuta del viaggio per registrare una conversione FX.')
  }

  const now = new Date().toISOString()
  const common = {
    amountMinor,
    currency,
    category: validateOptionalText(input.category, 'Categoria', 80),
    description: validateOptionalText(input.description, 'Descrizione', 500),
    occurredAt: validateLocalDateTime(input.occurredAt, day.date),
    paidByTravelerId,
    notes: validateOptionalText(input.notes, 'Note', 2000),
    fx,
  }

  const expense: Expense = current
    ? { ...current, ...common, tripId, dayId, updatedAt: now }
    : { id: crypto.randomUUID(), ...common, tripId, dayId, createdAt: now, updatedAt: now }

  await expenseBlockRepository.saveExpenseForBlock(blockId, tripId, dayId, expense)
  return expense
}

export async function deletePlannerExpenseBlock(
  tripId: string,
  dayId: string,
  blockId: string,
): Promise<void> {
  await assertExpenseDayContext(tripId, dayId, true)
  await expenseBlockRepository.softDeleteExpenseBlock(blockId, tripId, dayId)
}
