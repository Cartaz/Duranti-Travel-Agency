import type { Block, BlockType, Day, Template } from '../../domain/entities'
import { blockRepository, dayRepository, templateRepository } from '../../data/repositories/repositories'
import { createTripDay, type DayDraft } from '../days/day-service'

export const DAY_TEMPLATE_CATEGORY = 'day'

const SUPPORTED_DAY_TEMPLATE_BLOCK_TYPES = new Set<BlockType>([
  'text',
  'heading',
  'checklist',
  'divider',
  'place',
  'transport',
  'accommodation',
  'restaurant',
  'activity',
  'expense',
])

interface BuiltInTemplateDefinition {
  id: string
  name: string
  description: string
  definition: Template['definition']
}

const BUILT_IN_DAY_TEMPLATES: BuiltInTemplateDefinition[] = [
  {
    id: 'builtin-day-travel-v1',
    name: 'Giornata di viaggio',
    description: 'Spostamenti, controlli essenziali e spazio per annotare l’arrivo.',
    definition: {
      blocks: [
        { type: 'heading', position: 1, content: { text: 'Spostamenti' } },
        { type: 'transport', position: 2, content: {} },
        {
          type: 'checklist',
          position: 3,
          content: {
            items: [
              { id: 'travel-documents', text: 'Documenti e biglietti', checked: false },
              { id: 'travel-baggage', text: 'Bagaglio e oggetti essenziali', checked: false },
              { id: 'travel-transfer', text: 'Trasferimento all’arrivo', checked: false },
            ],
          },
        },
        { type: 'divider', position: 4, content: {} },
        { type: 'heading', position: 5, content: { text: 'Arrivo' } },
        { type: 'place', position: 6, content: {} },
        { type: 'text', position: 7, content: { text: '' } },
      ],
    },
  },
  {
    id: 'builtin-day-city-v1',
    name: 'Visita città',
    description: 'Mattina, pausa pranzo, pomeriggio e spazio per i ricordi della giornata.',
    definition: {
      blocks: [
        { type: 'heading', position: 1, content: { text: 'Mattina' } },
        { type: 'activity', position: 2, content: {} },
        { type: 'place', position: 3, content: {} },
        { type: 'heading', position: 4, content: { text: 'Pranzo' } },
        { type: 'restaurant', position: 5, content: {} },
        { type: 'heading', position: 6, content: { text: 'Pomeriggio' } },
        { type: 'activity', position: 7, content: {} },
        { type: 'place', position: 8, content: {} },
        { type: 'heading', position: 9, content: { text: 'Ricordi' } },
        { type: 'text', position: 10, content: { text: '' } },
      ],
    },
  },
  {
    id: 'builtin-day-museum-v1',
    name: 'Museo o attività',
    description: 'Attività principale, luogo, promemoria pratici e appunti finali.',
    definition: {
      blocks: [
        { type: 'heading', position: 1, content: { text: 'Visita' } },
        { type: 'activity', position: 2, content: {} },
        { type: 'place', position: 3, content: {} },
        {
          type: 'checklist',
          position: 4,
          content: {
            items: [
              { id: 'museum-ticket', text: 'Biglietti o prenotazione', checked: false },
              { id: 'museum-time', text: 'Controllare orario di ingresso', checked: false },
            ],
          },
        },
        { type: 'heading', position: 5, content: { text: 'Appunti e ricordi' } },
        { type: 'text', position: 6, content: { text: '' } },
      ],
    },
  },
  {
    id: 'builtin-day-excursion-v1',
    name: 'Escursione',
    description: 'Partenza, attività, luogo e checklist essenziale per una giornata fuori.',
    definition: {
      blocks: [
        { type: 'heading', position: 1, content: { text: 'Partenza' } },
        { type: 'transport', position: 2, content: {} },
        { type: 'heading', position: 3, content: { text: 'Escursione' } },
        { type: 'activity', position: 4, content: {} },
        { type: 'place', position: 5, content: {} },
        {
          type: 'checklist',
          position: 6,
          content: {
            items: [
              { id: 'excursion-water', text: 'Acqua e snack', checked: false },
              { id: 'excursion-clothes', text: 'Abbigliamento adatto', checked: false },
              { id: 'excursion-power', text: 'Batteria o power bank', checked: false },
            ],
          },
        },
        { type: 'heading', position: 7, content: { text: 'Ricordi' } },
        { type: 'text', position: 8, content: { text: '' } },
      ],
    },
  },
]

function cloneContent(content: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(content)
}

function validateTemplate(template: Template): Template {
  if (template.category !== DAY_TEMPLATE_CATEGORY) throw new Error('Questo template non è una giornata.')
  if (!Array.isArray(template.definition?.blocks)) throw new Error('La struttura del template non è valida.')

  for (const block of template.definition.blocks) {
    if (!SUPPORTED_DAY_TEMPLATE_BLOCK_TYPES.has(block.type)) {
      throw new Error(`Il template contiene un blocco non supportato: ${block.type}.`)
    }
    if (!block.content || typeof block.content !== 'object' || Array.isArray(block.content)) {
      throw new Error('Il template contiene un blocco con contenuto non valido.')
    }
  }
  return template
}

async function ensureBuiltInDayTemplates(): Promise<void> {
  const existing = new Map((await templateRepository.list({ includeDeleted: true })).map((template) => [template.id, template]))
  const now = new Date().toISOString()

  for (const definition of BUILT_IN_DAY_TEMPLATES) {
    const current = existing.get(definition.id)
    if (current?.deletedAt) continue
    if (current?.version === 1 && current.category === DAY_TEMPLATE_CATEGORY) continue

    const template: Template = {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      category: DAY_TEMPLATE_CATEGORY,
      version: 1,
      definition: structuredClone(definition.definition),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    }
    await templateRepository.put(template)
  }
}

export async function listDayTemplates(): Promise<Template[]> {
  await ensureBuiltInDayTemplates()
  const templates = (await templateRepository.list())
    .filter((template) => template.category === DAY_TEMPLATE_CATEGORY)
    .map(validateTemplate)

  const builtInOrder = new Map(BUILT_IN_DAY_TEMPLATES.map((template, index) => [template.id, index]))
  return templates.sort((left, right) => {
    const leftOrder = builtInOrder.get(left.id)
    const rightOrder = builtInOrder.get(right.id)
    if (leftOrder !== undefined || rightOrder !== undefined) {
      return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER)
    }
    return left.name.localeCompare(right.name, 'it')
  })
}

export async function createTripDayFromTemplate(
  tripId: string,
  draft: DayDraft,
  templateId: string,
): Promise<Day> {
  await ensureBuiltInDayTemplates()
  const template = await templateRepository.get(templateId)
  if (!template) throw new Error('Il template selezionato non è più disponibile.')
  validateTemplate(template)

  const day = await createTripDay(tripId, draft)
  const createdBlockIds: string[] = []

  try {
    const now = new Date().toISOString()
    const updatedDay: Day = { ...day, templateId: template.id, updatedAt: now }
    await dayRepository.put(updatedDay)

    const orderedBlocks = [...template.definition.blocks]
      .sort((left, right) => left.position - right.position)

    for (const [index, definition] of orderedBlocks.entries()) {
      const block: Block = {
        id: crypto.randomUUID(),
        tripId,
        dayId: day.id,
        type: definition.type,
        position: index + 1,
        content: cloneContent(definition.content),
        createdAt: now,
        updatedAt: now,
      }
      await blockRepository.put(block)
      createdBlockIds.push(block.id)
    }

    return updatedDay
  } catch (error) {
    for (const blockId of createdBlockIds) {
      try {
        await blockRepository.softDelete(blockId)
        await blockRepository.purge(blockId)
      } catch {
        // Best-effort rollback; the original template application error remains authoritative.
      }
    }
    try {
      await dayRepository.softDelete(day.id)
      await dayRepository.purge(day.id)
    } catch {
      // Best-effort rollback; leaving a tombstoned day is safer than masking the original error.
    }
    throw error
  }
}
