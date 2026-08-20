import type { Block, Itinerary } from '../../domain/entities'
import {
  blockRepository,
  itineraryRepository,
  reservationRepository,
} from '../../data/repositories/repositories'
import { assertPlannerDayContext } from '../planner/block-service'

export type OrphanResolutionAction = 'convert-to-manual' | 'delete'

const reservationBlockTypes = new Set<Block['type']>(['transport', 'accommodation', 'restaurant', 'activity'])

function reservationIdFromBlock(block: Block | undefined): string | undefined {
  if (!block || !reservationBlockTypes.has(block.type)) return undefined
  const value = block.content.reservationId
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) throw new Error('Il planner contiene un riferimento prenotazione non valido.')
  return value
}

async function assertStillOrphaned(itinerary: Itinerary, tripId: string, dayId: string): Promise<void> {
  const blocks = (await blockRepository.list())
    .filter((block) => block.tripId === tripId && block.dayId === dayId)
  const linkedBlock = itinerary.blockId ? blocks.find((block) => block.id === itinerary.blockId) : undefined
  const reservationId = itinerary.reservationId ?? reservationIdFromBlock(linkedBlock)

  if (!reservationId) return

  const reservation = await reservationRepository.get(reservationId)
  const sourceBlocks = blocks.filter((block) => reservationIdFromBlock(block) === reservationId)
  if (sourceBlocks.length > 1) {
    throw new Error('Più blocchi attivi fanno riferimento alla stessa prenotazione: risolvi prima l’ambiguità nel planner.')
  }
  if (reservation && sourceBlocks.length === 1) {
    throw new Error('La sorgente della tappa è di nuovo disponibile. Usa “Riallinea” invece di scollegarla.')
  }
}

async function nextManualUntimedPosition(tripId: string, dayId: string): Promise<number> {
  const siblings = (await itineraryRepository.list()).filter((item) => (
    item.tripId === tripId
    && item.dayId === dayId
    && !item.reservationId
    && !item.blockId
    && !item.startsAt
  ))
  return siblings.reduce((maximum, item) => Math.max(maximum, item.position ?? 0), 0) + 1
}

export async function resolveOrphanedItineraryItem(
  tripId: string,
  dayId: string,
  itineraryId: string,
  action: OrphanResolutionAction,
): Promise<void> {
  await assertPlannerDayContext(tripId, dayId, true)
  const itinerary = await itineraryRepository.get(itineraryId)
  if (!itinerary) throw new Error('La tappa non esiste più.')
  if (itinerary.tripId !== tripId || itinerary.dayId !== dayId) {
    throw new Error('La tappa non appartiene a questa giornata.')
  }
  if (!itinerary.reservationId && !itinerary.blockId) {
    throw new Error('La tappa è già manuale e non richiede una riconciliazione.')
  }

  await assertStillOrphaned(itinerary, tripId, dayId)

  if (action === 'delete') {
    await itineraryRepository.softDelete(itinerary.id)
    return
  }

  const now = new Date().toISOString()
  await itineraryRepository.put({
    ...itinerary,
    reservationId: undefined,
    blockId: undefined,
    position: itinerary.startsAt ? itinerary.position : await nextManualUntimedPosition(tripId, dayId),
    updatedAt: now,
  })
}
