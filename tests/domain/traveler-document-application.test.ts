import test from 'node:test'
import assert from 'node:assert/strict'
import { TravelerDocumentApplication } from '../../src/application/travelers/traveler-document-application.ts'
import type { TravelerDocumentRepositoryPort } from '../../src/application/travelers/document-ports.ts'

function createRepository(): TravelerDocumentRepositoryPort {
  const records = [
    { id: 'doc-a', travelerId: 'traveler-a', type: 'passport' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', secret: { documentNumber: 'A1' } },
    { id: 'doc-b', travelerId: 'traveler-b', type: 'visa' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z', secret: { documentNumber: 'B1' } },
  ]
  return {
    async create(input) { return { id: 'created', ...input, createdAt: '2026-01-04T00:00:00Z', updatedAt: '2026-01-04T00:00:00Z' } },
    async get(id) { return records.find((record) => record.id === id) },
    async listMetadata() { return records.map(({ secret: _secret, ...record }) => record) },
    async list() { return records },
    async updateSecret() {},
    async attachFile() { throw new Error('not used') },
    async getAttachment() { return undefined },
    async removeAttachment() { return 'no-attachment' },
    async softDelete() { return 'tombstoned' },
  }
}

test('traveler documents remain filtered behind the application boundary', async () => {
  let unlocked = false
  const application = new TravelerDocumentApplication({
    documents: createRepository(),
    security: {
      async isConfigured() { return true },
      isUnlocked() { return unlocked },
      async configure() { unlocked = true },
      async unlock() { unlocked = true },
      lock() { unlocked = false },
    },
  })

  assert.deepEqual(await application.getSecurityState(), { configured: true, unlocked: false })
  assert.deepEqual((await application.listForTraveler('traveler-a')).map((item) => item.id), ['doc-a'])
  await application.unlock('example-passphrase')
  assert.deepEqual((await application.listUnlockedForTraveler('traveler-a')).map((item) => item.secret.documentNumber), ['A1'])
  application.lock()
  assert.equal((await application.getSecurityState()).unlocked, false)
})
