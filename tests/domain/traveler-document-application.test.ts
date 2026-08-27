import test from 'node:test'
import assert from 'node:assert/strict'
import { TravelerDocumentApplication } from '../../src/application/travelers/traveler-document-application.ts'
import type { TravelerDocumentRepositoryPort } from '../../src/application/travelers/document-ports.ts'

function createRepository(onCreate?: () => void): TravelerDocumentRepositoryPort {
  const records = [
    { id: 'doc-a', travelerId: 'traveler-a', type: 'passport' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', secret: { documentNumber: 'A1' } },
    { id: 'doc-b', travelerId: 'traveler-b', type: 'visa' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z', secret: { documentNumber: 'B1' } },
  ]
  return {
    async create(input) { onCreate?.(); return { id: 'created', ...input, createdAt: '2026-01-04T00:00:00Z', updatedAt: '2026-01-04T00:00:00Z' } },
    async get(id) { return records.find((record) => record.id === id) },
    async listMetadataByTraveler(travelerId) {
      return records
        .filter((record) => record.travelerId === travelerId)
        .map(({ secret: _secret, ...record }) => record)
    },
    async listByTraveler(travelerId) { return records.filter((record) => record.travelerId === travelerId) },
    async updateSecret() {},
    async attachFile() { throw new Error('not used') },
    async getAttachment() { return undefined },
    async removeAttachment() { return 'no-attachment' },
    async softDelete() { return 'tombstoned' },
  }
}

function security() {
  let unlocked = false
  return {
    port: {
      async isConfigured() { return true },
      isUnlocked() { return unlocked },
      async configure() { unlocked = true },
      async unlock() { unlocked = true },
      lock() { unlocked = false },
    },
    isUnlocked: () => unlocked,
  }
}

test('traveler documents remain filtered behind the application boundary', async () => {
  const localSecurity = security()
  const application = new TravelerDocumentApplication({
    documents: createRepository(),
    travelers: { async get() { return undefined } },
    security: localSecurity.port,
  })

  assert.deepEqual(await application.getSecurityState(), { configured: true, unlocked: false })
  assert.deepEqual((await application.listForTraveler('traveler-a')).map((item) => item.id), ['doc-a'])
  await application.unlock('example-passphrase')
  assert.deepEqual((await application.listUnlockedForTraveler('traveler-a')).map((item) => item.secret.documentNumber), ['A1'])
  application.lock()
  assert.equal(localSecurity.isUnlocked(), false)
})

test('traveler document creation rejects a missing or deleted parent before persistence', async () => {
  let createCalls = 0
  const localSecurity = security()
  const parents = new Map([
    ['traveler-deleted', {
      id: 'traveler-deleted',
      firstName: 'Deleted',
      lastName: 'Traveler',
      displayName: 'Deleted Traveler',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      deletedAt: '2026-01-03T00:00:00Z',
    }],
  ])
  const application = new TravelerDocumentApplication({
    documents: createRepository(() => { createCalls += 1 }),
    travelers: { async get(id) { return parents.get(id) } },
    security: localSecurity.port,
  })

  await assert.rejects(
    application.create({ travelerId: 'traveler-missing', type: 'passport', secret: { documentNumber: 'X1' } }),
    /non esiste o è stato eliminato/,
  )
  await assert.rejects(
    application.create({ travelerId: 'traveler-deleted', type: 'passport', secret: { documentNumber: 'X2' } }),
    /non esiste o è stato eliminato/,
  )
  assert.equal(createCalls, 0)
})
