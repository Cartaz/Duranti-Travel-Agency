import type { Block, BlockType } from '../../domain/entities'
import type { BlockMoveDirection, PlannerApplicationDependencies } from './ports'

export type BasicPlannerBlockType = Extract<BlockType, 'text' | 'heading' | 'checklist' | 'divider'>
export type PlannerBlockType = BasicPlannerBlockType | Extract<BlockType, 'place' | 'transport' | 'accommodation' | 'restaurant' | 'activity' | 'expense'>

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

const plannerBlockTypes = new Set<BlockType>([
  'text', 'heading', 'checklist', 'divider', 'place', 'transport', 'accommodation', 'restaurant', 'activity', 'expense',
])
const basicPlannerBlockTypes = new Set<BlockType>(['text', 'heading', 'checklist', 'divider'])
const transactionalDeleteBlockTypes = new Set<BlockType>(['transport', 'accommodation', 'restaurant', 'activity', 'expense'])

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

function normalizeChecklistItems(value: unknown, newId: () => string): ChecklistItemDraft[] {
  if (!Array.isArray(value)) throw new Error('Checklist: elenco non valido.')
  if (value.length > 100) throw new Error('Checklist: massimo 100 elementi per blocco.')

  return value.map((item) => {
    if (!isRecord(item)) throw new Error('Checklist: elemento non valido.')
    const text = normalizeText(item.text, 'Checklist', 500).trim()
    const id = typeof item.id === 'string' && item.id ? item.id : newId()
    return { id, text, checked: item.checked === true }
  }).filter((item) => item.text.length > 0)
}

function normalizeDraft(input: PlannerBlockDraft, newId: () => string): PlannerBlockDraft {
  switch (input.type) {
    case 'text': return { type: 'text', text: normalizeText(input.text, 'Testo', 10_000) }
    case 'heading': return { type: 'heading', text: normalizeText(input.text, 'Titolo', 200) }
    case 'checklist': return { type: 'checklist', items: normalizeChecklistItems(input.items, newId) }
    case 'divider': return { type: 'divider' }
  }
}

function contentFromDraft(input: PlannerBlockDraft): Record<string, unknown> {
  switch (input.type) {
    case 'text':
    case 'heading': return { text: input.text }
    case 'checklist': return { items: input.items }
    case 'divider': return {}
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

export interface PlannerApplication {
  assertPlannerDayContext(tripId: string, dayId: string, editable: boolean): Promise<void>
  listDayPlannerBlocks(tripId: string, dayId: string): Promise<Block[]>
  readPlannerBlockDraft(block: Block): PlannerBlockDraft
  createPlannerBlock(tripId: string, dayId: string, type: PlannerBlockType): Promise<Block>
  updatePlannerBlock(tripId: string, dayId: string, blockId: string, input: PlannerBlockDraft): Promise<Block>
  movePlannerBlock(tripId: string, dayId: string, blockId: string, direction: BlockMoveDirection): Promise<void>
  deletePlannerBlock(tripId: string, dayId: string, blockId: string): Promise<void>
}

export function createPlannerApplication(deps: PlannerApplicationDependencies): PlannerApplication {
  async function assertPlannerDayContext(tripId: string, dayId: string, editable: boolean): Promise<void> {
    const trip = await deps.trips.getTrip(tripId)
    if (!trip) throw new Error('Il viaggio non esiste o è stato eliminato.')
    if (editable && trip.status === 'archived') {
      throw new Error('Ripristina il viaggio prima di modificare il planner.')
    }

    const day = await deps.days.getTripDay(tripId, dayId)
    if (!day) throw new Error('La giornata non appartiene a questo viaggio.')
  }

  async function listDayPlannerBlocks(tripId: string, dayId: string): Promise<Block[]> {
    await assertPlannerDayContext(tripId, dayId, false)
    const blocks = await deps.blocks.listByDay(dayId)
    return blocks
      .filter((block) => block.tripId === tripId && plannerBlockTypes.has(block.type))
      .sort((left, right) => (
        left.position - right.position ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id)
      ))
  }

  function readPlannerBlockDraft(block: Block): PlannerBlockDraft {
    assertBasicPlannerType(block.type)
    if (!isRecord(block.content)) throw new Error('Il contenuto del blocco non è valido.')

    switch (block.type) {
      case 'text': return normalizeDraft({ type: 'text', text: block.content.text as string }, deps.newId)
      case 'heading': return normalizeDraft({ type: 'heading', text: block.content.text as string }, deps.newId)
      case 'checklist': return normalizeDraft({ type: 'checklist', items: block.content.items as ChecklistItemDraft[] }, deps.newId)
      case 'divider': return { type: 'divider' }
    }
  }

  async function createPlannerBlock(tripId: string, dayId: string, type: PlannerBlockType): Promise<Block> {
    await assertPlannerDayContext(tripId, dayId, true)
    const siblings = (await deps.blocks.listByDay(dayId)).filter((block) => block.tripId === tripId)
    const position = siblings.reduce((maximum, block) => Math.max(maximum, block.position), 0) + 1
    const now = deps.now()
    const content = ['place', 'transport', 'accommodation', 'restaurant', 'activity', 'expense'].includes(type)
      ? {}
      : contentFromDraft(defaultDraft(type as BasicPlannerBlockType))

    const block: Block = {
      id: deps.newId(), tripId, dayId, type, position, content, createdAt: now, updatedAt: now,
    }
    await deps.blocks.put(block)
    return block
  }

  async function updatePlannerBlock(tripId: string, dayId: string, blockId: string, input: PlannerBlockDraft): Promise<Block> {
    await assertPlannerDayContext(tripId, dayId, true)
    const block = await deps.blocks.get(blockId)
    if (!block || block.tripId !== tripId || block.dayId !== dayId) throw new Error('Il blocco non appartiene a questa giornata.')
    assertBasicPlannerType(block.type)
    if (block.type !== input.type) throw new Error('Il tipo del blocco non può essere cambiato durante la modifica.')

    const draft = normalizeDraft(input, deps.newId)
    const updated: Block = { ...block, content: contentFromDraft(draft), updatedAt: deps.now() }
    await deps.blocks.put(updated)
    return updated
  }

  async function movePlannerBlock(tripId: string, dayId: string, blockId: string, direction: BlockMoveDirection): Promise<void> {
    await assertPlannerDayContext(tripId, dayId, true)
    const result = await deps.blocks.moveWithinDay(blockId, tripId, dayId, direction)
    if (result === 'not-found') throw new Error('Il blocco non esiste più.')
    if (result === 'invalid-context') throw new Error('Il blocco non appartiene a questa giornata.')
  }

  async function deletePlannerBlock(tripId: string, dayId: string, blockId: string): Promise<void> {
    await assertPlannerDayContext(tripId, dayId, true)
    const block = await deps.blocks.get(blockId)
    if (!block || block.tripId !== tripId || block.dayId !== dayId) throw new Error('Il blocco non appartiene a questa giornata.')
    if (transactionalDeleteBlockTypes.has(block.type)) {
      throw new Error('Questo blocco deve essere eliminato dal suo editor dedicato per rimuovere in sicurezza i dati collegati.')
    }
    const result = await deps.blocks.softDelete(blockId)
    if (result === 'not-found') throw new Error('Il blocco non esiste più.')
  }

  return {
    assertPlannerDayContext,
    listDayPlannerBlocks,
    readPlannerBlockDraft,
    createPlannerBlock,
    updatePlannerBlock,
    movePlannerBlock,
    deletePlannerBlock,
  }
}