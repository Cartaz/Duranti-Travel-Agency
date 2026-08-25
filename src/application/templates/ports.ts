import type { Block, Day, Template, Trip } from '../../domain/entities'
import type { DayDraft } from '../days/day-application'

export interface TemplateRepositoryPort {
  list(options?: { includeDeleted?: boolean }): Promise<Template[]>
  get(id: string): Promise<Template | undefined>
  put(value: Template): Promise<unknown>
  softDelete(id: string): Promise<unknown>
}

export interface TemplateBlockRepositoryPort {
  list(): Promise<Block[]>
  put(value: Block): Promise<unknown>
  softDelete(id: string): Promise<unknown>
  purge(id: string): Promise<unknown>
}

export interface TemplateDayRepositoryPort {
  get(id: string): Promise<Day | undefined>
  put(value: Day): Promise<unknown>
  softDelete(id: string): Promise<unknown>
  purge(id: string): Promise<unknown>
}

export interface TemplateTripRepositoryPort {
  get(id: string): Promise<Trip | undefined>
}

export interface DayCreatorPort {
  createTripDay(tripId: string, input: DayDraft): Promise<Day>
}

export interface DayTemplateApplicationDependencies {
  templates: TemplateRepositoryPort
  blocks: TemplateBlockRepositoryPort
  days: TemplateDayRepositoryPort
  trips: TemplateTripRepositoryPort
  dayCreator: DayCreatorPort
  now(): string
  newId(): string
}
