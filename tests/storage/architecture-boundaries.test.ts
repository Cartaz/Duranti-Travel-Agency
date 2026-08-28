import test from 'node:test'
import assert from 'node:assert/strict'
import { collectArchitectureViolations } from '../../scripts/architecture-policy.mjs'

test('strategic dependency direction stays acyclic across architectural layers', async () => {
  assert.deepEqual(await collectArchitectureViolations(), [])
})
