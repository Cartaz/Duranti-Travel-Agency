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
}

export interface TemplateTripRepositoryPort {
  get(id: string): Promise<Trip | undefined>
}

export interface DayTemplateTransactionPort {
  createDayWithBlocks(day: Omit<Day, 'sequence'>, blocks: Block[]): Promise<Day>
}

export interface DayTemplateApplicationDependencies {
  templates: TemplateRepositoryPort
  blocks: TemplateBlockRepositoryPort
  days: TemplateDayRepositoryPort
  trips: TemplateTripRepositoryPort
  transactions: DayTemplateTransactionPort
  now(): string
  newId(): string
}
