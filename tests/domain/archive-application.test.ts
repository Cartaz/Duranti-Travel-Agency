import assert from 'node:assert/strict'
import test from 'node:test'
import { createArchiveApplication, isBackupDue } from '../../src/application/archive/archive-application.ts'
import type { StoragePersistenceState } from '../../src/domain/archive.ts'

function harness(options: {
  persistence?: StoragePersistenceState
  granted?: boolean
  lastSavedAt?: string
  trips?: boolean
}) {
  let lastSavedAt = options.lastSavedAt
  let persistence = options.persistence ?? 'best-effort'
  const application = createArchiveApplication({
    persistence: {
      inspect: async () => persistence,
      request: async () => {
        if (options.granted) persistence = 'persistent'
        return persistence
      },
    },
    ledger: {
      readLastSavedAt: async () => lastSavedAt,
      recordSaved: async (at) => {
        lastSavedAt = at
      },
    },
    data: { hasActiveTrips: async () => options.trips ?? true },
    now: () => '2026-11-27T10:00:00.000Z',
  })
  return { application, saved: () => lastSavedAt }
}

test('a backup is due only when trips exist and no recent external copy is recorded', () => {
  const now = '2026-11-27T10:00:00.000Z'
  assert.equal(isBackupDue(false, undefined, now), false)
  assert.equal(isBackupDue(true, undefined, now), true)
  assert.equal(isBackupDue(true, '2026-11-20T10:00:00.000Z', now), false)
  assert.equal(isBackupDue(true, '2026-10-20T10:00:00.000Z', now), true)
  assert.equal(isBackupDue(true, 'not-a-date', now), true)
})

test('recording a saved backup clears the reminder', async () => {
  const { application, saved } = harness({ trips: true })
  assert.equal((await application.getStatus()).backupDue, true)
  assert.equal(await application.recordBackupSaved(), '2026-11-27T10:00:00.000Z')
  assert.equal(saved(), '2026-11-27T10:00:00.000Z')
  const status = await application.getStatus()
  assert.equal(status.backupDue, false)
  assert.equal(status.lastBackupAt, '2026-11-27T10:00:00.000Z')
})

test('persistence requests report what the browser actually granted', async () => {
  assert.equal(await harness({ granted: true }).application.requestPersistence(), 'persistent')
  assert.equal(await harness({ granted: false }).application.requestPersistence(), 'best-effort')
})
