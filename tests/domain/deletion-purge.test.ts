import assert from 'node:assert/strict'
import test from 'node:test'
import { purgeDeletedFiles } from '../../src/application/shared/purge.ts'

test('file purge after a committed deletion reports leftovers instead of hiding them', async () => {
  const purged: string[] = []
  const outcome = await purgeDeletedFiles(['ok', 'referenced', 'broken'], async (id) => {
    if (id === 'broken') throw new Error('OPFS unavailable')
    if (id === 'referenced') return 'referenced'
    purged.push(id)
    return 'purged'
  })
  assert.deepEqual(purged, ['ok'])
  assert.equal(outcome.pendingFileCleanup, 2)
})

test('batch file purge uses purgeMany once and counts referenced or errored ids', async () => {
  let singleCalls = 0
  let batchCalls = 0
  const outcome = await purgeDeletedFiles(
    ['ok', 'referenced', 'broken', 'ok'],
    async () => {
      singleCalls += 1
      return 'purged'
    },
    async (ids) => {
      batchCalls += 1
      assert.deepEqual(ids, ['ok', 'referenced', 'broken'])
      return new Map([
        ['ok', 'purged'],
        ['referenced', 'referenced'],
        ['broken', 'error'],
      ])
    },
  )
  assert.equal(singleCalls, 0)
  assert.equal(batchCalls, 1)
  assert.equal(outcome.pendingFileCleanup, 2)

  const failedBatch = await purgeDeletedFiles(
    ['a', 'b'],
    async () => 'purged',
    async () => {
      throw new Error('lock failed')
    },
  )
  assert.equal(failedBatch.pendingFileCleanup, 2)
})
