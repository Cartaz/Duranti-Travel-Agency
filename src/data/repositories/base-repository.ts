import type { EntityBase } from '../../domain/entities'
import type { EntityTable } from 'dexie'
import { assertEntityBase } from '../db/validate'

export class Repository<T extends EntityBase> {
  constructor(protected readonly table: EntityTable<T, 'id'>) {}

  async get(id: string): Promise<T | undefined> {
    return this.table.get(id)
  }

  async list(): Promise<T[]> {
    return this.table.toArray()
  }

  async put(entity: T): Promise<string> {
    assertEntityBase(entity, 'Entity')
    await this.table.put(entity)
    return entity.id
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id)
  }

  async count(): Promise<number> {
    return this.table.count()
  }
}
