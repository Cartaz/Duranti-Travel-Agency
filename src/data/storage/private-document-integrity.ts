import type { TravelerDocumentAttachment } from '../../domain/entities'
import {
  isLocalEncryptionUnlocked,
  LocalEncryptionLockedError,
} from '../../security/local-encryption'
import { db } from '../db/dtagency-db'
import {
  buildPrivateDocumentAttachmentPath,
  deleteEncryptedDocumentAttachment,
  deleteEncryptedDocumentDirectory,
  expectedEncryptedDocumentAttachmentBytes,
  inspectEncryptedDocumentAttachment,
  listPrivateDocumentAttachmentEntries,
  listPrivateDocumentRootEntries,
} from '../opfs/private-document-store'
import {
  secureTravelerDocumentRepository,
  type TravelerDocumentView,
} from '../repositories/traveler-document-repository'

export interface PrivateDocumentAttachmentRef {
  documentId: string
  attachmentId: string
}

export interface PrivateDocumentPathMismatch extends PrivateDocumentAttachmentRef {
  storedPath: string
  expectedPath: string
}

export interface PrivateDocumentSizeMismatch extends PrivateDocumentAttachmentRef {
  plaintextBytes: number
  encryptedBytes: number
  expectedEncryptedBytes: number
}

export interface PrivateDocumentUnexpectedEntry {
  documentId?: string
  name: string
  kind: 'file' | 'directory'
}

export interface PrivateDocumentUnreadableEntry {
  documentId: string
  attachmentId?: string
  errorName: string
  message: string
}

export interface PrivateDocumentIntegrityReport {
  scannedAt: string
  metadataCount: number
  activeMetadataCount: number
  tombstonedMetadataCount: number
  secureMetadataCount: number
  attachmentMetadataCount: number
  documentsWithoutAttachmentCount: number
  opfsDirectoryCount: number
  healthyAttachmentCount: number
  invalidAttachmentMetadataIds: string[]
  missingAttachments: PrivateDocumentAttachmentRef[]
  orphanDirectoryIds: string[]
  orphanAttachments: PrivateDocumentAttachmentRef[]
  staleEmptyDirectoryIds: string[]
  pathMismatches: PrivateDocumentPathMismatch[]
  sizeMismatches: PrivateDocumentSizeMismatch[]
  invalidEnvelopeAttachments: PrivateDocumentAttachmentRef[]
  unexpectedEntries: PrivateDocumentUnexpectedEntry[]
  unreadableMetadata: PrivateDocumentUnreadableEntry[]
  unreadableEntries: PrivateDocumentUnreadableEntry[]
  isClean: boolean
}

function errorDetails(error: unknown): { errorName: string; message: string } {
  if (error instanceof DOMException) return { errorName: error.name, message: error.message }
  if (error instanceof Error) return { errorName: error.name, message: error.message }
  return { errorName: 'UnknownError', message: String(error) }
}

function isTravelerDocumentAttachment(value: unknown): value is TravelerDocumentAttachment {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' && record.id.length > 0 &&
    typeof record.opfsPath === 'string' && record.opfsPath.length > 0 &&
    typeof record.mimeType === 'string' && record.mimeType.length > 0 &&
    typeof record.sizeBytes === 'number' && Number.isSafeInteger(record.sizeBytes) && record.sizeBytes > 0 &&
    (record.originalName === undefined || typeof record.originalName === 'string')
  )
}

async function listDocumentEntriesSafely(
  documentId: string,
  unreadableEntries: PrivateDocumentUnreadableEntry[],
) {
  try {
    return await listPrivateDocumentAttachmentEntries(documentId)
  } catch (error) {
    unreadableEntries.push({ documentId, ...errorDetails(error) })
    return undefined
  }
}

function collectDirectoryResidue(
  documentId: string,
  expectedAttachmentId: string | undefined,
  entries: Awaited<ReturnType<typeof listPrivateDocumentAttachmentEntries>>,
  orphanAttachments: PrivateDocumentAttachmentRef[],
  unexpectedEntries: PrivateDocumentUnexpectedEntry[],
): void {
  for (const entry of entries) {
    if (entry.kind === 'file' && entry.attachmentId) {
      if (entry.attachmentId !== expectedAttachmentId) {
        orphanAttachments.push({ documentId, attachmentId: entry.attachmentId })
      }
      continue
    }
    unexpectedEntries.push({ documentId, name: entry.name, kind: entry.kind })
  }
}

export async function scanPrivateDocumentIntegrity(): Promise<PrivateDocumentIntegrityReport> {
  if (!isLocalEncryptionUnlocked()) throw new LocalEncryptionLockedError()

  const metadata = await db.travelerDocuments.toArray()
  const rootEntries = await listPrivateDocumentRootEntries()
  const metadataIds = new Set(metadata.map((record) => record.id))
  const documentDirectoryIds = rootEntries
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => entry.name)
  const directoryIdSet = new Set(documentDirectoryIds)

  const orphanDirectoryIds = documentDirectoryIds.filter((id) => !metadataIds.has(id))
  const unexpectedEntries: PrivateDocumentUnexpectedEntry[] = rootEntries
    .filter((entry) => entry.kind !== 'directory')
    .map((entry) => ({ name: entry.name, kind: entry.kind }))

  const missingAttachments: PrivateDocumentAttachmentRef[] = []
  const orphanAttachments: PrivateDocumentAttachmentRef[] = []
  const staleEmptyDirectoryIds: string[] = []
  const pathMismatches: PrivateDocumentPathMismatch[] = []
  const sizeMismatches: PrivateDocumentSizeMismatch[] = []
  const invalidEnvelopeAttachments: PrivateDocumentAttachmentRef[] = []
  const invalidAttachmentMetadataIds: string[] = []
  const unreadableMetadata: PrivateDocumentUnreadableEntry[] = []
  const unreadableEntries: PrivateDocumentUnreadableEntry[] = []

  let attachmentMetadataCount = 0
  let documentsWithoutAttachmentCount = 0
  let healthyAttachmentCount = 0

  for (const record of metadata) {
    let view: TravelerDocumentView | undefined
    try {
      view = await secureTravelerDocumentRepository.get(record.id, { includeDeleted: true })
    } catch (error) {
      unreadableMetadata.push({ documentId: record.id, ...errorDetails(error) })
      continue
    }
    if (!view) continue

    const candidateAttachment: unknown = view.attachment
    if (candidateAttachment !== undefined && !isTravelerDocumentAttachment(candidateAttachment)) {
      invalidAttachmentMetadataIds.push(record.id)
      continue
    }

    const attachment = candidateAttachment as TravelerDocumentAttachment | undefined
    const directoryExists = directoryIdSet.has(record.id)

    if (!attachment) {
      documentsWithoutAttachmentCount += 1
      if (!directoryExists) continue
      const entries = await listDocumentEntriesSafely(record.id, unreadableEntries)
      if (!entries) continue
      if (entries.length === 0) staleEmptyDirectoryIds.push(record.id)
      collectDirectoryResidue(record.id, undefined, entries, orphanAttachments, unexpectedEntries)
      continue
    }

    attachmentMetadataCount += 1
    const expectedPath = buildPrivateDocumentAttachmentPath(record.id, attachment.id)
    let healthy = true
    if (attachment.opfsPath !== expectedPath) {
      pathMismatches.push({
        documentId: record.id,
        attachmentId: attachment.id,
        storedPath: attachment.opfsPath,
        expectedPath,
      })
      healthy = false
    }

    if (!directoryExists) {
      missingAttachments.push({ documentId: record.id, attachmentId: attachment.id })
      continue
    }

    const entries = await listDocumentEntriesSafely(record.id, unreadableEntries)
    if (!entries) continue
    collectDirectoryResidue(record.id, attachment.id, entries, orphanAttachments, unexpectedEntries)

    const expectedEntry = entries.find(
      (entry) => entry.kind === 'file' && entry.attachmentId === attachment.id,
    )
    if (!expectedEntry) {
      missingAttachments.push({ documentId: record.id, attachmentId: attachment.id })
      continue
    }

    try {
      const inspection = await inspectEncryptedDocumentAttachment(record.id, attachment.id)
      const expectedEncryptedBytes = expectedEncryptedDocumentAttachmentBytes(attachment.sizeBytes)
      if (inspection.encryptedSizeBytes !== expectedEncryptedBytes) {
        sizeMismatches.push({
          documentId: record.id,
          attachmentId: attachment.id,
          plaintextBytes: attachment.sizeBytes,
          encryptedBytes: inspection.encryptedSizeBytes,
          expectedEncryptedBytes,
        })
        healthy = false
      }
      if (!inspection.envelopeValid) {
        invalidEnvelopeAttachments.push({ documentId: record.id, attachmentId: attachment.id })
        healthy = false
      }
    } catch (error) {
      unreadableEntries.push({ documentId: record.id, attachmentId: attachment.id, ...errorDetails(error) })
      healthy = false
    }

    if (healthy) healthyAttachmentCount += 1
  }

  const activeMetadataCount = metadata.filter((record) => !record.deletedAt).length
  const tombstonedMetadataCount = metadata.length - activeMetadataCount
  const isClean =
    invalidAttachmentMetadataIds.length === 0 &&
    missingAttachments.length === 0 &&
    orphanDirectoryIds.length === 0 &&
    orphanAttachments.length === 0 &&
    staleEmptyDirectoryIds.length === 0 &&
    pathMismatches.length === 0 &&
    sizeMismatches.length === 0 &&
    invalidEnvelopeAttachments.length === 0 &&
    unexpectedEntries.length === 0 &&
    unreadableMetadata.length === 0 &&
    unreadableEntries.length === 0

  return {
    scannedAt: new Date().toISOString(),
    metadataCount: metadata.length,
    activeMetadataCount,
    tombstonedMetadataCount,
    secureMetadataCount: metadata.length,
    attachmentMetadataCount,
    documentsWithoutAttachmentCount,
    opfsDirectoryCount: documentDirectoryIds.length,
    healthyAttachmentCount,
    invalidAttachmentMetadataIds,
    missingAttachments,
    orphanDirectoryIds,
    orphanAttachments,
    staleEmptyDirectoryIds,
    pathMismatches,
    sizeMismatches,
    invalidEnvelopeAttachments,
    unexpectedEntries,
    unreadableMetadata,
    unreadableEntries,
    isClean,
  }
}

export async function removeOrphanPrivateDocumentDirectory(documentId: string): Promise<void> {
  const metadata = await db.travelerDocuments.get(documentId)
  if (metadata) throw new Error(`Private document directory ${documentId} is not orphaned because metadata exists.`)
  const rootEntries = await listPrivateDocumentRootEntries()
  const entry = rootEntries.find((candidate) => candidate.name === documentId)
  if (!entry) return
  if (entry.kind !== 'directory') throw new Error(`Private OPFS entry ${documentId} is not a document directory.`)
  await deleteEncryptedDocumentDirectory(documentId)
}

export async function removeOrphanPrivateDocumentAttachment(
  documentId: string,
  attachmentId: string,
): Promise<void> {
  if (!isLocalEncryptionUnlocked()) throw new LocalEncryptionLockedError()
  const metadata = await db.travelerDocuments.get(documentId)
  if (!metadata) throw new Error(`Traveler document ${documentId} does not exist; remove its orphan directory instead.`)
  const view = await secureTravelerDocumentRepository.get(documentId, { includeDeleted: true })
  if (!view) throw new Error(`Traveler document ${documentId} could not be read.`)
  const candidateAttachment: unknown = view.attachment
  if (candidateAttachment !== undefined && !isTravelerDocumentAttachment(candidateAttachment)) {
    throw new Error(`Traveler document ${documentId} has invalid attachment metadata; cleanup is unsafe.`)
  }
  const attachment = candidateAttachment as TravelerDocumentAttachment | undefined
  if (attachment?.id === attachmentId) {
    throw new Error(`Encrypted attachment ${attachmentId} is still referenced by traveler document ${documentId}.`)
  }
  try {
    await deleteEncryptedDocumentAttachment(documentId, attachmentId)
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
  }
}

export async function removeStaleEmptyPrivateDocumentDirectory(documentId: string): Promise<void> {
  if (!isLocalEncryptionUnlocked()) throw new LocalEncryptionLockedError()
  const metadata = await db.travelerDocuments.get(documentId)
  if (!metadata) throw new Error(`Traveler document ${documentId} does not exist; use orphan-directory cleanup instead.`)
  const view = await secureTravelerDocumentRepository.get(documentId, { includeDeleted: true })
  if (!view) throw new Error(`Traveler document ${documentId} could not be read.`)
  if (view.attachment) throw new Error(`Traveler document ${documentId} still references an encrypted attachment.`)
  const entries = await listPrivateDocumentAttachmentEntries(documentId)
  if (entries.length > 0) throw new Error(`Private document directory ${documentId} is not empty.`)
  await deleteEncryptedDocumentDirectory(documentId)
}
