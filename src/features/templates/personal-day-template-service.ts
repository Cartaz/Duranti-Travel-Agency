import type { Template } from '../../domain/entities'
import { templateRepository } from '../../data/repositories/repositories'
import {
  DAY_TEMPLATE_CATEGORY,
  isBuiltInDayTemplate,
  listDayTemplates,
  MAX_DAY_TEMPLATE_NAME_LENGTH,
} from './day-template-service'

function normalizeName(value: string): string {
  const name = value.trim()
  if (!name) throw new Error('Inserisci un nome per il modello.')
  if (name.length > MAX_DAY_TEMPLATE_NAME_LENGTH) {
    throw new Error(`Il nome del modello può contenere al massimo ${MAX_DAY_TEMPLATE_NAME_LENGTH} caratteri.`)
  }
  return name
}

async function getPersonalTemplate(templateId: string): Promise<Template> {
  const template = await templateRepository.get(templateId)
  if (!template || template.category !== DAY_TEMPLATE_CATEGORY) {
    throw new Error('Il modello personale non è più disponibile.')
  }
  if (isBuiltInDayTemplate(template)) {
    throw new Error('I modelli predefiniti non possono essere modificati o eliminati.')
  }
  return template
}

export async function renamePersonalDayTemplate(templateId: string, value: string): Promise<Template> {
  const template = await getPersonalTemplate(templateId)
  const name = normalizeName(value)

  const duplicate = (await listDayTemplates()).find((candidate) => (
    candidate.id !== template.id
    && candidate.name.trim().localeCompare(name, 'it', { sensitivity: 'accent' }) === 0
  ))
  if (duplicate) throw new Error('Esiste già un modello di giornata con questo nome.')

  if (template.name === name) return template

  const updated: Template = {
    ...template,
    name,
    updatedAt: new Date().toISOString(),
  }
  await templateRepository.put(updated)
  return updated
}

export async function deletePersonalDayTemplate(templateId: string): Promise<void> {
  await getPersonalTemplate(templateId)
  const result = await templateRepository.softDelete(templateId)
  if (result === 'not-found') throw new Error('Il modello personale non è più disponibile.')
}
