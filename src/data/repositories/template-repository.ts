import type { Template } from '../../domain/entities'
import { db } from '../db/dtagency-db'
import { Repository, type RepositoryReadOptions } from './base-repository'

export class TemplateRepository extends Repository<Template> {
  constructor() {
    super(db.templates)
  }

  async listByCategory(
    category: string,
    options: RepositoryReadOptions = {},
  ): Promise<Template[]> {
    const templates = await db.templates.where('category').equals(category).toArray()
    if (options.includeDeleted) return templates
    return templates.filter((template) => !template.deletedAt)
  }
}

export const templateRepository = new TemplateRepository()
