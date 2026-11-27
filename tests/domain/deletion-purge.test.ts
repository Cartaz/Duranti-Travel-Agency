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
