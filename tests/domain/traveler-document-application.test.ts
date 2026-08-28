import test from 'node:test'
import assert from 'node:assert/strict'
import { TravelerDocumentApplication } from '../../src/application/travelers/traveler-document-application.ts'
import type { TravelerDocumentRepositoryPort } from '../../src/application/travelers/document-ports.ts'

function createRepository(calls: string[] = []): TravelerDocumentRepositoryPort {
  const records = [
    { id: 'doc-a', travelerId: 'traveler-a', type: 'passport' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', secret: { documentNumber: 'A1' } },
    { id: 'doc-b', travelerId: 'traveler-b', type: 'visa' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z', secret: { documentNumber: 'B1' } },
  ]
  return {
    async create(input) { return { id: 'created', ...input, createdAt: '2026-01-04T00:00:00Z', updatedAt: '2026-01-04T00:00:00Z' } },
    async get(id) { return records.find((record) => record.id === id) },
    async listMetadataByTraveler(travelerId) {
      calls.push(`metadata:${travelerId}`)
      return records.filter((record) => record.travelerId === travelerId).map(({ secret: _secret, ...record }) => record)
    },
    async listByTraveler(travelerId) {
      calls.push(`unlocked:${travelerId}`)
      return records.filter((record) => record.travelerId === travelerId)
    },
    async updateSecret() {},
    async attachFile() { throw new Error('not used') },
    async getAttachment() { return undefined },
    async removeAttachment() { return 'no-attachment' },
    async softDelete() { return 'tombstoned' },
  }
}

test('traveler document application uses traveler-scoped repository queries', async () => {
  let unlocked = false
  const calls: string[] = []
  const application = new TravelerDocumentApplication({
    documents: createRepository(calls),
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
  assert.deepEqual(calls, ['metadata:traveler-a', 'unlocked:traveler-a'])
  application.lock()
  assert.equal((await application.getSecurityState()).unlocked, false)
})
