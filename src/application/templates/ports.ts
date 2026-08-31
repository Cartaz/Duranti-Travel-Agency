import type { Block, Day, Template, Trip } from '../../domain/entities'

export interface TemplateRepositoryPort {
  listByCategory(category: string, options?: { includeDeleted?: boolean }): Promise<Template[]>
  get(id: string): Promise<Template | undefined>
  put(value: Template): Promise<unknown>
  softDelete(id: string): Promise<unknown>
}

export interface TemplateBlockRepositoryPort {
  listByDay(dayId: string): Promise<Block[]>
}

export interface TemplateDayRepositoryPort {
  get(id: string): Promise<Day | undefined>
  createForTrip(value: Omit<Day, 'sequence'>, initialBlocks?: Block[]): Promise<Day>
}

export interface TemplateTripRepositoryPort {
  get(id: string): Promise<Trip | undefined>
}

export interface DayTemplateApplicationDependencies {
  templates: TemplateRepositoryPort
  blocks: TemplateBlockRepositoryPort
  days: TemplateDayRepositoryPort
  trips: TemplateTripRepositoryPort
  now(): string
  newId(): string
}
