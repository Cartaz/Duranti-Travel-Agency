import type { Block, BlockType, Day, Template } from '../../domain/entities'
import { normalizeDayDraft, type DayDraft } from '../days/day-application'
import { requireTripDay } from '../shared/trip-day-context'
import type { DayTemplateApplicationDependencies } from './ports'

export const DAY_TEMPLATE_CATEGORY = 'day'
export const MAX_DAY_TEMPLATE_NAME_LENGTH = 120
export const MAX_DAY_TEMPLATE_DESCRIPTION_LENGTH = 400

const SUPPORTED_DAY_TEMPLATE_BLOCK_TYPES = new Set<BlockType>([
  'text', 'heading', 'checklist', 'divider', 'place', 'transport', 'accommodation', 'restaurant', 'activity', 'expense',
])

interface BuiltInTemplateDefinition {
  id: string
  name: string
  description: string
  definition: Template['definition']
}

export interface PersonalDayTemplateDraft {
  name: string
  description?: string
}

const BUILT_IN_DAY_TEMPLATES: BuiltInTemplateDefinition[] = [
  {
    id: 'builtin-day-travel-v1', name: 'Giornata di viaggio',
    description: 'Spostamenti, controlli essenziali e spazio per annotare l’arrivo.',
    definition: { blocks: [
      { type: 'heading', position: 1, content: { text: 'Spostamenti' } },
      { type: 'transport', position: 2, content: {} },
      { type: 'checklist', position: 3, content: { items: [
        { id: 'travel-documents', text: 'Documenti e biglietti', checked: false },
        { id: 'travel-baggage', text: 'Bagaglio e oggetti essenziali', checked: false },
        { id: 'travel-transfer', text: 'Trasferimento all’arrivo', checked: false },
      ] } },
      { type: 'divider', position: 4, content: {} },
      { type: 'heading', position: 5, content: { text: 'Arrivo' } },
      { type: 'place', position: 6, content: {} },
      { type: 'text', position: 7, content: { text: '' } },
    ] },
  },
  {
    id: 'builtin-day-city-v1', name: 'Visita città',
    description: 'Mattina, pausa pranzo, pomeriggio e spazio per i ricordi della giornata.',
    definition: { blocks: [
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
    ] },
  },
  {
    id: 'builtin-day-museum-v1', name: 'Museo o attività',
    description: 'Attività principale, luogo, promemoria pratici e appunti finali.',
    definition: { blocks: [
      { type: 'heading', position: 1, content: { text: 'Visita' } },
      { type: 'activity', position: 2, content: {} },
      { type: 'place', position: 3, content: {} },
      { type: 'checklist', position: 4, content: { items: [
        { id: 'museum-ticket', text: 'Biglietti o prenotazione', checked: false },
        { id: 'museum-time', text: 'Controllare orario di ingresso', checked: false },
      ] } },
      { type: 'heading', position: 5, content: { text: 'Appunti e ricordi' } },
      { type: 'text', position: 6, content: { text: '' } },
    ] },
  },
  {
    id: 'builtin-day-excursion-v1', name: 'Escursione',
    description: 'Partenza, attività, luogo e checklist essenziale per una giornata fuori.',
    definition: { blocks: [
      { type: 'heading', position: 1, content: { text: 'Partenza' } },
      { type: 'transport', position: 2, content: {} },
      { type: 'heading', position: 3, content: { text: 'Escursione' } },
      { type: 'activity', position: 4, content: {} },
      { type: 'place', position: 5, content: {} },
      { type: 'checklist', position: 6, content: { items: [
        { id: 'excursion-water', text: 'Acqua e snack', checked: false },
        { id: 'excursion-clothes', text: 'Abbigliamento adatto', checked: false },
        { id: 'excursion-power', text: 'Batteria o power bank', checked: false },
      ] } },
      { type: 'heading', position: 7, content: { text: 'Ricordi' } },
      { type: 'text', position: 8, content: { text: '' } },
    ] },
  },
]

const BUILT_IN_DAY_TEMPLATE_IDS = new Set(BUILT_IN_DAY_TEMPLATES.map((template) => template.id))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}
function cloneContent(content: Record<string, unknown>): Record<string, unknown> { return structuredClone(content) }
function cleanReusableText(value: unknown, maxLength: number): string { return typeof value === 'string' ? value.slice(0, maxLength) : '' }
function reusableChecklistContent(content: Record<string, unknown>, regenerateIds: boolean, newId: () => string): Record<string, unknown> {
  if (!Array.isArray(content.items)) return { items: [] }
  const items = content.items.flatMap((item, index) => {
    if (!isRecord(item) || typeof item.text !== 'string') return []
    const text = item.text.trim().slice(0, 500)
    if (!text) return []
    return [{ id: regenerateIds ? newId() : `template-item-${index + 1}`, text, checked: false }]
  }).slice(0, 100)
  return { items }
}
function reusableBlockContent(type: BlockType, content: Record<string, unknown>, regenerateChecklistIds: boolean, newId: () => string): Record<string, unknown> {
  switch (type) {
    case 'text': return { text: cleanReusableText(content.text, 10_000) }
    case 'heading': return { text: cleanReusableText(content.text, 200) }
    case 'checklist': return reusableChecklistContent(content, regenerateChecklistIds, newId)
    case 'divider':
    case 'place':
    case 'transport':
    case 'accommodation':
    case 'restaurant':
    case 'activity':
    case 'expense': return {}
    default: throw new Error(`Il tipo di blocco ${type} non può essere usato in un template di giornata.`)
  }
}

export interface DayTemplateApplication {
  isBuiltInDayTemplate(templateOrId: Template | string): boolean
  listDayTemplates(): Promise<Template[]>
  createPersonalDayTemplate(tripId: string, dayId: string, input: PersonalDayTemplateDraft): Promise<Template>
  renamePersonalDayTemplate(templateId: string, name: string): Promise<Template>
  deletePersonalDayTemplate(templateId: string): Promise<void>
  createTripDayFromTemplate(tripId: string, draft: DayDraft, templateId: string): Promise<Day>
}

export function createDayTemplateApplication(deps: DayTemplateApplicationDependencies): DayTemplateApplication {
  function validateTemplate(template: Template): Template {
    if (template.category !== DAY_TEMPLATE_CATEGORY) throw new Error('Questo template non è una giornata.')
    if (!Array.isArray(template.definition?.blocks)) throw new Error('La struttura del template non è valida.')
    for (const block of template.definition.blocks) {
      if (!SUPPORTED_DAY_TEMPLATE_BLOCK_TYPES.has(block.type)) throw new Error(`Il template contiene un blocco non supportato: ${block.type}.`)
      if (!block.content || typeof block.content !== 'object' || Array.isArray(block.content)) throw new Error('Il template contiene un blocco con contenuto non valido.')
    }
    return template
  }

  function isBuiltInDayTemplate(templateOrId: Template | string): boolean {
    const id = typeof templateOrId === 'string' ? templateOrId : templateOrId.id
    return BUILT_IN_DAY_TEMPLATE_IDS.has(id)
  }

  async function ensureBuiltInDayTemplates(): Promise<void> {
    const existing = new Map((await deps.templates.listByCategory(DAY_TEMPLATE_CATEGORY, { includeDeleted: true })).map((template) => [template.id, template]))
    const now = deps.now()
    for (const definition of BUILT_IN_DAY_TEMPLATES) {
      const current = existing.get(definition.id)
      if (current?.deletedAt) continue
      if (current?.version === 1 && current.category === DAY_TEMPLATE_CATEGORY) continue
      await deps.templates.put({
        id: definition.id, name: definition.name, description: definition.description,
        category: DAY_TEMPLATE_CATEGORY, version: 1, definition: structuredClone(definition.definition),
        createdAt: current?.createdAt ?? now, updatedAt: now,
      })
    }
  }

  async function listDayTemplates(): Promise<Template[]> {
    await ensureBuiltInDayTemplates()
    const templates = (await deps.templates.listByCategory(DAY_TEMPLATE_CATEGORY)).map(validateTemplate)
    const builtInOrder = new Map(BUILT_IN_DAY_TEMPLATES.map((template, index) => [template.id, index]))
    return templates.sort((left, right) => {
      const leftOrder = builtInOrder.get(left.id)
      const rightOrder = builtInOrder.get(right.id)
      if (leftOrder !== undefined || rightOrder !== undefined) return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER)
      return left.name.localeCompare(right.name, 'it')
    })
  }

  async function createPersonalDayTemplate(tripId: string, dayId: string, input: PersonalDayTemplateDraft): Promise<Template> {
    const { trip, day } = await requireTripDay({ trips: deps.trips, days: deps.days }, tripId, dayId)
    if (trip.status === 'archived') throw new Error('Ripristina il viaggio prima di creare un modello dalla giornata.')
    const name = input.name.trim()
    if (!name) throw new Error('Inserisci un nome per il modello.')
    if (name.length > MAX_DAY_TEMPLATE_NAME_LENGTH) throw new Error(`Il nome del modello può contenere al massimo ${MAX_DAY_TEMPLATE_NAME_LENGTH} caratteri.`)
    const description = cleanOptional(input.description)
    if (description && description.length > MAX_DAY_TEMPLATE_DESCRIPTION_LENGTH) throw new Error(`La descrizione può contenere al massimo ${MAX_DAY_TEMPLATE_DESCRIPTION_LENGTH} caratteri.`)
    await ensureBuiltInDayTemplates()
    const duplicate = (await deps.templates.listByCategory(DAY_TEMPLATE_CATEGORY)).find((template) => template.name.trim().localeCompare(name, 'it', { sensitivity: 'accent' }) === 0)
    if (duplicate) throw new Error('Esiste già un modello di giornata con questo nome.')
    const blocks = (await deps.blocks.listByDay(dayId))
      .filter((block) => block.tripId === tripId && block.dayId === dayId && SUPPORTED_DAY_TEMPLATE_BLOCK_TYPES.has(block.type))
      .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    if (blocks.length === 0) throw new Error('Questa giornata non contiene ancora una struttura da salvare come modello.')
    const definition: Template['definition'] = {
      blocks: blocks.map((block, index) => ({ type: block.type, position: index + 1, content: reusableBlockContent(block.type, block.content, false, deps.newId) })),
    }
    const now = deps.now()
    const template: Template = {
      id: `custom-day-${deps.newId()}`, name,
      description: description ?? `Modello personale creato da “${day.title?.trim() || `Giorno ${day.sequence}`}”.`,
      category: DAY_TEMPLATE_CATEGORY, version: 1, definition, createdAt: now, updatedAt: now,
    }
    validateTemplate(template)
    await deps.templates.put(template)
    return template
  }

  async function getPersonalTemplate(templateId: string): Promise<Template> {
    const template = await deps.templates.get(templateId)
    if (!template || template.category !== DAY_TEMPLATE_CATEGORY) throw new Error('Il modello personale non è più disponibile.')
    if (isBuiltInDayTemplate(template)) throw new Error('I modelli predefiniti non possono essere modificati o eliminati.')
    return template
  }

  async function renamePersonalDayTemplate(templateId: string, value: string): Promise<Template> {
    const template = await getPersonalTemplate(templateId)
    const name = value.trim()
    if (!name) throw new Error('Inserisci un nome per il modello.')
    if (name.length > MAX_DAY_TEMPLATE_NAME_LENGTH) throw new Error(`Il nome del modello può contenere al massimo ${MAX_DAY_TEMPLATE_NAME_LENGTH} caratteri.`)
    const duplicate = (await listDayTemplates()).find((candidate) => candidate.id !== template.id && candidate.name.trim().localeCompare(name, 'it', { sensitivity: 'accent' }) === 0)
    if (duplicate) throw new Error('Esiste già un modello di giornata con questo nome.')
    if (template.name === name) return template
    const updated: Template = { ...template, name, updatedAt: deps.now() }
    await deps.templates.put(updated)
    return updated
  }

  async function deletePersonalDayTemplate(templateId: string): Promise<void> {
    await getPersonalTemplate(templateId)
    const result = await deps.templates.softDelete(templateId)
    if (result === 'not-found') throw new Error('Il modello personale non è più disponibile.')
  }

  async function createTripDayFromTemplate(tripId: string, draft: DayDraft, templateId: string): Promise<Day> {
    await ensureBuiltInDayTemplates()
    const template = await deps.templates.get(templateId)
    if (!template) throw new Error('Il template selezionato non è più disponibile.')
    validateTemplate(template)

    const normalizedDraft = normalizeDayDraft(draft)
    const now = deps.now()
    const dayId = deps.newId()
    const orderedBlocks = [...template.definition.blocks].sort((left, right) => left.position - right.position)
    const blocks: Block[] = orderedBlocks.map((definition, index) => ({
      id: deps.newId(),
      tripId,
      dayId,
      type: definition.type,
      position: index + 1,
      content: reusableBlockContent(definition.type, cloneContent(definition.content), true, deps.newId),
      createdAt: now,
      updatedAt: now,
    }))

    return deps.days.createForTrip({
      id: dayId,
      tripId,
      templateId: template.id,
      createdAt: now,
      updatedAt: now,
      ...normalizedDraft,
    }, blocks)
  }

  return {
    isBuiltInDayTemplate, listDayTemplates, createPersonalDayTemplate, renamePersonalDayTemplate,
    deletePersonalDayTemplate, createTripDayFromTemplate,
  }
}
