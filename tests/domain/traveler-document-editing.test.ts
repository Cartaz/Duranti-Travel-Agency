import test from 'node:test'
import assert from 'node:assert/strict'
import { TravelerDocumentApplication } from '../../src/application/travelers/traveler-document-application.ts'
import type { TravelerDocumentRepositoryPort } from '../../src/application/travelers/document-ports.ts'

function createApplication(calls: string[]) {
  const repository: TravelerDocumentRepositoryPort = {
    async create(input) {
      return {
        id: 'doc-1',
        ...input,
        createdAt: '2026-08-26T00:00:00Z',
        updatedAt: '2026-08-26T00:00:00Z',
      }
    },
    async get() { return undefined },
    async listMetadata() { return [] },
    async list() { return [] },
    async updateSecret(id, secret) {
      calls.push(`secret:${id}:${secret.documentNumber ?? ''}`)
    },
    async attachFile(id, file) {
      calls.push(`attach:${id}:${file.name}`)
      return {
        storagePath: 'dtagency/private/traveler-documents/doc-1/file.bin',
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }
    },
    async getAttachment() { return undefined },
    async removeAttachment(id) {
      calls.push(`remove-attachment:${id}`)
      return 'removed'
    },
    async softDelete() { return 'tombstoned' },
  }

  return new TravelerDocumentApplication({
    documents: repository,
    security: {
      async isConfigured() { return true },
      isUnlocked() { return true },
      async configure() {},
      async unlock() {},
      lock() {},
    },
  })
}

test('traveler document editing stays behind the application boundary', async () => {
  const calls: string[] = []
  const application = createApplication(calls)

  await application.updateSecret('doc-1', { documentNumber: 'YA1234567' })
  await application.replaceAttachment('doc-1', new File(['scan'], 'passport.pdf', { type: 'application/pdf' }))
  await application.removeAttachment('doc-1')

  assert.deepEqual(calls, [
    'secret:doc-1:YA1234567',
    'attach:doc-1:passport.pdf',
    'remove-attachment:doc-1',
  ])
})
