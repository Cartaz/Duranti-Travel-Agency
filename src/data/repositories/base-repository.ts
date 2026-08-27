import type { EntityBase } from '../../domain/entities'
import type { Table } from 'dexie'
import { assertEntityBase } from '../db/validate'

type EntityId = EntityBase['id']

export type SoftDeleteResult = 'not-found' | 'already-deleted' | 'tombstoned'
export type RestoreResult = 'not-found' | 'already-active' | 'restored'
export type PurgeResult = 'not-found' | 'purged'

export interface RepositoryReadOptions {
  includeDeleted?: boolean
}

export class Repository<T extends EntityBase> {
  constructor(protected readonly table: Table<T, EntityId>) {}

  async get(
    id: EntityId,
    options: RepositoryReadOptions = {},
  ): Promise<T | undefined> {
    const entity = await this.table.get(id)
    if (!entity || (!options.includeDeleted && entity.deletedAt)) return undefined
    return entity
  }

  async getMany(
    ids: EntityId[],
    options: RepositoryReadOptions = {},
  ): Promise<T[]> {
    const entities = await this.table.bulkGet(ids)
    return entities.filter((entity): entity is T => Boolean(
      entity && (options.includeDeleted || !entity.deletedAt),
    ))
  }

  async list(options: RepositoryReadOptions = {}): Promise<T[]> {
    const entities = await this.table.toArray()
    if (options.includeDeleted) return entities
    return entities.filter((entity) => !entity.deletedAt)
  }

  async put(entity: T): Promise<EntityId> {
    assertEntityBase(entity, 'Entity')

    const existing = await this.table.get(entity.id)
    if (existing?.deletedAt && !entity.deletedAt) {
      throw new Error(`Entity ${entity.id} is tombstoned. Use restore() before updating it.`)
    }

    await this.table.put(entity)
    return entity.id
  }

  async softDelete(id: EntityId): Promise<SoftDeleteResult> {
    const entity = await this.table.get(id)
    if (!entity) return 'not-found'
    if (entity.deletedAt) return 'already-deleted'

    const now = new Date().toISOString()
    await this.table.put({
      ...entity,
      deletedAt: now,
      updatedAt: now,
    })
    return 'tombstoned'
  }

  async restore(id: EntityId): Promise<RestoreResult> {
    const entity = await this.table.get(id)
    if (!entity) return 'not-found'
    if (!entity.deletedAt) return 'already-active'

    await this.table.put({
      ...entity,
      deletedAt: undefined,
      updatedAt: new Date().toISOString(),
    })
    return 'restored'
  }

  async purge(id: EntityId): Promise<PurgeResult> {
    const entity = await this.table.get(id)
    if (!entity) return 'not-found'
    if (!entity.deletedAt) {
      throw new Error(`Entity ${id} must be tombstoned before it can be purged.`)
    }

    await this.table.delete(id)
    return 'purged'
  }
}
