import type { Block, BlockType } from '../../domain/entities'
import type { BlockMoveDirection } from '../../data/repositories/block-repository'
import { blockRepository } from '../../data/repositories/repositories'
import { getTripDay } from '../days/day-service'
import { getTrip } from '../trips/trip-service'

export type BasicPlannerBlockType = Extract<BlockType, 'text' | 'heading' | 'checklist' | 'divider'>
export type PlannerBlockType = BasicPlannerBlockType | Extract<BlockType, 'place' | 'transport' | 'accommodation' | 'expense'>

export interface ChecklistItemDraft {
  id: string
  text: string
  checked: boolean
}

export type PlannerBlockDraft =
  | { type: 'text'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'checklist'; items: ChecklistItemDraft[] }
  | { type: 'divider' }

const plannerBlockTypes = new Set<BlockType>(['text', 'heading', 'checklist', 'divider', 'place', 'transport', 'accommodation', 'expense'])
const basicPlannerBlockTypes = new Set<BlockType>(['text', 'heading', 'checklist', 'divider'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertBasicPlannerType(type: BlockType): asserts type is BasicPlannerBlockType {
  if (!basicPlannerBlockTypes.has(type)) throw new Error('Questo tipo di blocco usa un editor dedicato.')
}

function normalizeText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${label}: contenuto non valido.`)
  if (value.length > maxLength) throw new Error(`${label}: contenuto troppo lungo.`)
  return value
}

function normalizeChecklistItems(value: unknown): ChecklistItemDraft[] {
  if (!Array.isArray(value)) throw new Error('Checklist: elenco non valido.')
  if (value.length > 100) throw new Error('Checklist: massimo 100 elementi per blocco.')

  return value.map((item) => {
    if (!isRecord(item)) throw new Error('Checklist: elemento non valido.')
    const text = normalizeText(item.text, 'Checklist', 500).trim()
    const id = typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID()
    return { id, text, checked: item.checked === true }
  }).filter((item) => item.text.length > 0)
}

function normalizeDraft(input: PlannerBlockDraft): PlannerBlockDraft {
  switch (input.type) {
    case 'text':
      return { type: 'text', text: normalizeText(input.text, 'Testo', 10_000) }
    case 'heading':
      return { type: 'heading', text: normalizeText(input.text, 'Titolo', 200) }
    case 'checklist':
      return { type: 'checklist', items: normalizeChecklistItems(input.items) }
    case 'divider':
      return { type: 'divider' }
  }
}

function contentFromDraft(input: PlannerBlockDraft): Record<string, unknown> {
  switch (input.type) {
    case 'text':
    case 'heading':
      return { text: input.text }
    case 'checklist':
      return { items: input.items }
    case 'divider':
      return {}
  }
}

function defaultDraft(type: BasicPlannerBlockType): PlannerBlockDraft {
  switch (type) {
    case 'text': return { type: 'text', text: '' }
    case 'heading': return { type: 'heading', text: '' }
    case 'checklist': return { type: 'checklist', items: [] }
    case 'divider': return { type: 'divider' }
  }
}

export async function assertPlannerDayContext(tripId: string, dayId: string, editable: boolean): Promise<void> {
  const trip = await getTrip(tripId)
  if (!trip) throw new Error('Il viaggio non esiste o è stato eliminato.')
  if (editable && trip.status === 'archived') {
    throw new Error('Ripristina il viaggio prima di modificare il planner.')
  }

  const day = await getTripDay(tripId, dayId)
  if (!day) throw new Error('La giornata non appartiene a questo viaggio.')
}

export async function listDayPlannerBlocks(tripId: string, dayId: string): Promise<Block[]> {
  await assertPlannerDayContext(tripId, dayId, false)
  const blocks = await blockRepository.list()
  return blocks
    .filter((block) => block.tripId === tripId && block.dayId === dayId && plannerBlockTypes.has(block.type))
    .sort((left, right) => (
      left.position - right.position ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
    ))
}

export function readPlannerBlockDraft(block: Block): PlannerBlockDraft {
  assertBasicPlannerType(block.type)
  if (!isRecord(block.content)) throw new Error('Il contenuto del blocco non è valido.')

  switch (block.type) {
    case 'text':
      return normalizeDraft({ type: 'text', text: block.content.text as string })
    case 'heading':
      return normalizeDraft({ type: 'heading', text: block.content.text as string })
    case 'checklist':
      return normalizeDraft({ type: 'checklist', items: block.content.items as ChecklistItemDraft[] })
    case 'divider':
      return { type: 'divider' }
  }
}

export async function createPlannerBlock(
  tripId: string,
  dayId: string,
  type: PlannerBlockType,
): Promise<Block> {
  await assertPlannerDayContext(tripId, dayId, true)
  const siblings = (await blockRepository.list())
    .filter((block) => block.tripId === tripId && block.dayId === dayId)
  const position = siblings.reduce((maximum, block) => Math.max(maximum, block.position), 0) + 1
  const now = new Date().toISOString()
  const content = type === 'place' || type === 'transport' || type === 'accommodation' || type === 'expense'
    ? {}
    : contentFromDraft(defaultDraft(type))

  const block: Block = {
    id: crypto.randomUUID(),
    tripId,
    dayId,
    type,
    position,
    content,
    createdAt: now,
    updatedAt: now,
  }

  await blockRepository.put(block)
  return block
}

export async function updatePlannerBlock(
  tripId: string,
  dayId: string,
  blockId: string,
  input: PlannerBlockDraft,
): Promise<Block> {
  await assertPlannerDayContext(tripId, dayId, true)
  const block = await blockRepository.get(blockId)
  if (!block || block.tripId !== tripId || block.dayId !== dayId) {
    throw new Error('Il blocco non appartiene a questa giornata.')
  }
  assertBasicPlannerType(block.type)
  if (block.type !== input.type) throw new Error('Il tipo del blocco non può essere cambiato durante la modifica.')

  const draft = normalizeDraft(input)
  const updated: Block = {
    ...block,
    content: contentFromDraft(draft),
    updatedAt: new Date().toISOString(),
  }

  await blockRepository.put(updated)
  return updated
}

export async function movePlannerBlock(
  tripId: string,
  dayId: string,
  blockId: string,
  direction: BlockMoveDirection,
): Promise<void> {
  await assertPlannerDayContext(tripId, dayId, true)
  const result = await blockRepository.moveWithinDay(blockId, tripId, dayId, direction)
  if (result === 'not-found') throw new Error('Il blocco non esiste più.')
  if (result === 'invalid-context') throw new Error('Il blocco non appartiene a questa giornata.')
}

export async function deletePlannerBlock(tripId: string, dayId: string, blockId: string): Promise<void> {
  await assertPlannerDayContext(tripId, dayId, true)
  const block = await blockRepository.get(blockId)
  if (!block || block.tripId !== tripId || block.dayId !== dayId) {
    throw new Error('Il blocco non appartiene a questa giornata.')
  }

  const result = await blockRepository.softDelete(blockId)
  if (result === 'not-found') throw new Error('Il blocco non esiste più.')
}
