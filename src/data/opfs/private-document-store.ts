import { decryptBytes, encryptBytes } from '../../security/local-encryption'

const ROOT_DIRECTORY = 'duranti'
const PRIVATE_DIRECTORY = 'private'
const DOCUMENT_DIRECTORY = 'traveler-documents'
const FILE_EXTENSION = '.enc'
const FILE_MAGIC = new TextEncoder().encode('DURDOC01')
const AES_GCM_IV_BYTES = 12
const AES_GCM_TAG_BYTES = 16
const ENCRYPTION_PURPOSE = 'traveler-document-attachment'
const ENVELOPE_OVERHEAD_BYTES = FILE_MAGIC.length + AES_GCM_IV_BYTES + AES_GCM_TAG_BYTES
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/

// Web Crypto encrypt/decrypt takes the complete BufferSource at once. Keep v1
// deliberately bounded until a reviewed chunked encrypted format is introduced.
export const MAX_PRIVATE_DOCUMENT_BYTES = 20 * 1024 * 1024

export interface PrivateDocumentRootEntry {
  name: string
  kind: 'file' | 'directory'
}

export interface PrivateDocumentAttachmentEntry extends PrivateDocumentRootEntry {
  attachmentId?: string
}

export interface PrivateDocumentAttachmentInspection {
  encryptedSizeBytes: number
  envelopeValid: boolean
}

function assertOpfsSupport(): void {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    throw new Error('Origin Private File System (OPFS) is not available in this browser.')
  }
}

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`${label} contains characters that are not allowed in private OPFS paths.`)
  }
}

function attachmentFileName(attachmentId: string): string {
  assertSafeSegment(attachmentId, 'Attachment ID')
  return `${attachmentId}${FILE_EXTENSION}`
}

function attachmentIdFromFileName(fileName: string): string | undefined {
  if (!fileName.endsWith(FILE_EXTENSION)) return undefined
  const attachmentId = fileName.slice(0, -FILE_EXTENSION.length)
  return SAFE_SEGMENT.test(attachmentId) ? attachmentId : undefined
}

function encryptionEntityId(documentId: string, attachmentId: string): string {
  return `${documentId}:${attachmentId}`
}

async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
  assertOpfsSupport()
  return navigator.storage.getDirectory()
}

async function getPrivateDocumentsDirectory(create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await getRootDirectory()
  const duranti = await root.getDirectoryHandle(ROOT_DIRECTORY, { create })
  const privateDirectory = await duranti.getDirectoryHandle(PRIVATE_DIRECTORY, { create })
  return privateDirectory.getDirectoryHandle(DOCUMENT_DIRECTORY, { create })
}

async function getExistingPrivateDocumentsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await getPrivateDocumentsDirectory(false)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

async function requireDocumentDirectory(documentId: string): Promise<FileSystemDirectoryHandle> {
  assertSafeSegment(documentId, 'Document ID')
  const documentsDirectory = await getExistingPrivateDocumentsDirectory()
  if (!documentsDirectory) {
    throw new DOMException('Duranti private document directory was not found.', 'NotFoundError')
  }
  return documentsDirectory.getDirectoryHandle(documentId)
}

async function getDirectoryEntries(
  directory: FileSystemDirectoryHandle,
): Promise<Array<[string, FileSystemHandle]>> {
  const iterableDirectory = directory as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>
  }

  if (typeof iterableDirectory.entries !== 'function') {
    throw new Error('OPFS directory iteration is not available in this browser build.')
  }

  const entries: Array<[string, FileSystemHandle]> = []
  for await (const entry of iterableDirectory.entries()) entries.push(entry)
  return entries
}

function buildEnvelope(
  iv: Uint8Array<ArrayBuffer>,
  ciphertext: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const envelope = new Uint8Array(FILE_MAGIC.length + AES_GCM_IV_BYTES + ciphertext.length)
  envelope.set(FILE_MAGIC, 0)
  envelope.set(iv, FILE_MAGIC.length)
  envelope.set(ciphertext, FILE_MAGIC.length + AES_GCM_IV_BYTES)
  return envelope
}

function hasRecognizedMagic(prefix: Uint8Array<ArrayBuffer>): boolean {
  if (prefix.length !== FILE_MAGIC.length) return false
  for (let index = 0; index < FILE_MAGIC.length; index += 1) {
    if (prefix[index] !== FILE_MAGIC[index]) return false
  }
  return true
}

function parseEnvelope(bytes: Uint8Array<ArrayBuffer>): {
  iv: Uint8Array<ArrayBuffer>
  ciphertext: Uint8Array<ArrayBuffer>
} {
  if (bytes.length < ENVELOPE_OVERHEAD_BYTES) {
    throw new Error('Encrypted private document file is truncated.')
  }

  const prefix = bytes.slice(0, FILE_MAGIC.length)
  if (!hasRecognizedMagic(prefix)) {
    throw new Error('Unsupported encrypted private document file format.')
  }

  return {
    iv: bytes.slice(FILE_MAGIC.length, FILE_MAGIC.length + AES_GCM_IV_BYTES),
    ciphertext: bytes.slice(FILE_MAGIC.length + AES_GCM_IV_BYTES),
  }
}

export function buildPrivateDocumentAttachmentPath(documentId: string, attachmentId: string): string {
  assertSafeSegment(documentId, 'Document ID')
  return `${ROOT_DIRECTORY}/${PRIVATE_DIRECTORY}/${DOCUMENT_DIRECTORY}/${documentId}/${attachmentFileName(attachmentId)}`
}

export function expectedEncryptedDocumentAttachmentBytes(plaintextBytes: number): number {
  if (!Number.isSafeInteger(plaintextBytes) || plaintextBytes < 0) {
    throw new Error('Private document plaintext byte size must be a non-negative safe integer.')
  }
  return plaintextBytes + ENVELOPE_OVERHEAD_BYTES
}

export async function listPrivateDocumentRootEntries(): Promise<PrivateDocumentRootEntry[]> {
  const documentsDirectory = await getExistingPrivateDocumentsDirectory()
  if (!documentsDirectory) return []

  const entries = await getDirectoryEntries(documentsDirectory)
  return entries
    .map(([name, handle]) => ({ name, kind: handle.kind }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listPrivateDocumentAttachmentEntries(
  documentId: string,
): Promise<PrivateDocumentAttachmentEntry[]> {
  const documentDirectory = await requireDocumentDirectory(documentId)
  const entries = await getDirectoryEntries(documentDirectory)

  return entries
    .map(([name, handle]) => ({
      name,
      kind: handle.kind,
      ...(handle.kind === 'file' && attachmentIdFromFileName(name)
        ? { attachmentId: attachmentIdFromFileName(name) }
        : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function inspectEncryptedDocumentAttachment(
  documentId: string,
  attachmentId: string,
): Promise<PrivateDocumentAttachmentInspection> {
  const documentDirectory = await requireDocumentDirectory(documentId)
  const fileHandle = await documentDirectory.getFileHandle(attachmentFileName(attachmentId))
  const file = await fileHandle.getFile()

  if (file.size < ENVELOPE_OVERHEAD_BYTES) {
    return { encryptedSizeBytes: file.size, envelopeValid: false }
  }

  const prefix = new Uint8Array(await file.slice(0, FILE_MAGIC.length).arrayBuffer())
  try {
    return {
      encryptedSizeBytes: file.size,
      envelopeValid: hasRecognizedMagic(prefix),
    }
  } finally {
    prefix.fill(0)
  }
}

export async function writeEncryptedDocumentAttachment(
  documentId: string,
  attachmentId: string,
  source: Blob,
): Promise<string> {
  assertSafeSegment(documentId, 'Document ID')
  if (source.size <= 0) throw new Error('Private document attachment must not be empty.')
  if (source.size > MAX_PRIVATE_DOCUMENT_BYTES) {
    throw new Error(`Private document attachment exceeds the ${MAX_PRIVATE_DOCUMENT_BYTES} byte v1 limit.`)
  }

  const documentsDirectory = await getPrivateDocumentsDirectory(true)
  const documentDirectory = await documentsDirectory.getDirectoryHandle(documentId, { create: true })
  const fileName = attachmentFileName(attachmentId)
  const plaintext = new Uint8Array(await source.arrayBuffer())

  try {
    const encrypted = await encryptBytes(
      ENCRYPTION_PURPOSE,
      encryptionEntityId(documentId, attachmentId),
      plaintext,
    )
    const envelope = buildEnvelope(encrypted.iv, encrypted.ciphertext)
    const fileHandle = await documentDirectory.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()

    try {
      await writable.write(envelope)
      await writable.close()
    } catch (error) {
      try {
        await writable.abort()
      } catch {
        // Preserve the original write error.
      }
      try {
        await documentDirectory.removeEntry(fileName)
      } catch {
        // Best-effort rollback only.
      }
      throw error
    }
  } finally {
    plaintext.fill(0)
  }

  return buildPrivateDocumentAttachmentPath(documentId, attachmentId)
}

export async function readEncryptedDocumentAttachment(
  documentId: string,
  attachmentId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const documentDirectory = await requireDocumentDirectory(documentId)
  const fileHandle = await documentDirectory.getFileHandle(attachmentFileName(attachmentId))
  const file = await fileHandle.getFile()
  const envelope = new Uint8Array(await file.arrayBuffer())

  try {
    const { iv, ciphertext } = parseEnvelope(envelope)
    return await decryptBytes(
      ENCRYPTION_PURPOSE,
      encryptionEntityId(documentId, attachmentId),
      iv,
      ciphertext,
    )
  } finally {
    envelope.fill(0)
  }
}

export async function encryptedDocumentAttachmentExists(
  documentId: string,
  attachmentId: string,
): Promise<boolean> {
  try {
    const documentDirectory = await requireDocumentDirectory(documentId)
    await documentDirectory.getFileHandle(attachmentFileName(attachmentId))
    return true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false
    throw error
  }
}

export async function deleteEncryptedDocumentAttachment(
  documentId: string,
  attachmentId: string,
): Promise<void> {
  const documentDirectory = await requireDocumentDirectory(documentId)
  await documentDirectory.removeEntry(attachmentFileName(attachmentId))
}

export async function deleteEncryptedDocumentDirectory(documentId: string): Promise<void> {
  assertSafeSegment(documentId, 'Document ID')
  const documentsDirectory = await getExistingPrivateDocumentsDirectory()
  if (!documentsDirectory) {
    throw new DOMException('Duranti private document directory was not found.', 'NotFoundError')
  }
  await documentsDirectory.removeEntry(documentId, { recursive: true })
}
