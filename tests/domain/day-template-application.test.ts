import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../support/source.ts'

async function source(path: string): Promise<string> {
  return readSource(new URL(path, import.meta.url))
}

test('day template application uses semantic category and day queries', async () => {
  const application = await source('../../src/application/templates/day-template-application.ts')

  assert.match(application, /deps\.templates\.listByCategory\(DAY_TEMPLATE_CATEGORY/)
  assert.match(application, /deps\.blocks\.listByDay\(dayId\)/)
  assert.doesNotMatch(application, /deps\.templates\.list\(/)
  assert.doesNotMatch(application, /deps\.blocks\.list\(/)
})

test('template repository implements category lookup through the indexed category field', async () => {
  const repository = await source('../../src/data/repositories/template-repository.ts')

  assert.match(repository, /db\.templates\.where\('category'\)\.equals\(category\)\.toArray\(\)/)
  assert.match(repository, /options\.includeDeleted/)
})
