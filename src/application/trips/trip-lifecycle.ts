import type { Trip, TripStatus } from '../../domain/entities.ts'

export type EditableTripStatus = Exclude<TripStatus, 'archived'>

const editableStatuses = new Set<TripStatus>(['planned', 'ongoing', 'completed'])

export function validateEditableTripStatus(status: EditableTripStatus): EditableTripStatus {
  if (!editableStatuses.has(status)) throw new Error('Lo stato del viaggio non è valido.')
  return status
}

export function applyTripStatus(existing: Trip, status: EditableTripStatus, updatedAt: string): Trip {
  if (existing.status === 'archived') {
    throw new Error('Ripristina il viaggio dall’archivio prima di cambiarne lo stato.')
  }

  const nextStatus = validateEditableTripStatus(status)
  if (existing.status === nextStatus) return existing

  return {
    ...existing,
    status: nextStatus,
    archivedFromStatus: undefined,
    updatedAt,
  }
}
