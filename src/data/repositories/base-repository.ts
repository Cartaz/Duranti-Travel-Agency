import type { EntityBase } from '../../domain/entities'
import type { Table } from 'dexie'
import { assertEntityBase } from '../db/validate'

type EntityId = EntityBase['id']

export class Repository<T extends EntityBase> {
  constructor(protected readonly table: Table<T, EntityId>) {}

  async get(id: EntityId): Promise<T | undefined> {
    return this.table.get(id)
  }

  async list(): Promise<T[]> {
    return this.table.toArray()
  }

  async put(entity: T): Promise<EntityId> {
    assertEntityBase(entity, 'Entity')
    await this.table.put(entity)
    return entity.id
  }

  async delete(id: EntityId): Promise<void> {
    await this.table.delete(id)
  }

  async count(): Promise<number> {
    return this.table.count()
  }
}
