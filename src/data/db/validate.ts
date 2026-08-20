import type { Block, EntityBase } from '../../domain/entities'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function assertEntityBase(value: unknown, label: string): asserts value is EntityBase {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') {
    throw new ValidationError(`${label}: invalid entity identity or timestamps`)
  }
}

export function assertBlock(value: unknown): asserts value is Block {
  assertEntityBase(value, 'Block')
  if (!isRecord(value) || typeof value.tripId !== 'string' || typeof value.type !== 'string' || !isBlockType(value.type) || typeof value.position !== 'number' || !Number.isFinite(value.position) || !isRecord(value.content)) {
    throw new ValidationError('Block: invalid block shape')
  }
}

export function assertImportRecord(value: unknown): asserts value is EntityBase {
  assertEntityBase(value, 'Imported record')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBlockType(value: string): value is Block['type'] {
  return ['text','heading','checklist','place','map','media','link','quote','divider','table','expense','transport','accommodation','restaurant','activity','document','weatherSnapshot'].includes(value)
}
