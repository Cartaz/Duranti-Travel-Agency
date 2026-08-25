import test from 'node:test'
import assert from 'node:assert/strict'
import type { Block, Day, Template, Trip } from '../../src/domain/entities'
import { createDayTemplateApplication } from '../../src/application/templates/day-template-application'

const timestamp = '2026-08-25T12:00:00.000Z'

function createFixture() {
  const trip: Trip = {
    id: 'trip-1',
    title: 'Template trip',
    status: 'planned',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const day: Day = {
    id: 'day-1',
    tripId: trip.id,
    sequence: 1,
    date: '2026-09-01',
    title: 'Arrivo',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const blocks: Block[] = [
    {
      id: 'heading-1', tripId: trip.id, dayId: day.id, type: 'heading', position: 2,
      content: { text: 'Pomeriggio' }, createdAt: timestamp, updatedAt: timestamp,
    },
    {
      id: 'text-1', tripId: trip.id, dayId: day.id, type: 'text', position: 1,
      content: { text: 'Passeggiata' }, createdAt: timestamp, updatedAt: timestamp,
    },
    {
      id: 'foreign-1', tripId: 'trip-2', dayId: day.id, type: 'text', position: 3,
      content: { text: 'Non includere' }, createdAt: timestamp, updatedAt: timestamp,
    },
  ]
  const templates = new Map<string, Template>()
  const categoryCalls: Array<{ category: string; includeDeleted: boolean }> = []
  const dayCalls: string[] = []
  let idSequence = 0

  const application = createDayTemplateApplication({
    templates: {
      async listByCategory(category, options) {
        categoryCalls.push({ category, includeDeleted: Boolean(options?.includeDeleted) })
        return Array.from(templates.values()).filter((template) => (
          template.category === category && (options?.includeDeleted || !template.deletedAt)
        ))
      },
      get: async (id) => templates.get(id),
      put: async (template) => { templates.set(template.id, template); return template.id },
      softDelete: async () => 'tombstoned',
    },
    blocks: {
      async listByDay(dayId) { dayCalls.push(dayId); return blocks },
      put: async (block) => block.id,
      softDelete: async () => 'tombstoned',
      purge: async () => 'purged',
    },
    days: {
      get: async (id) => id === day.id ? day : undefined,
      put: async (value) => value.id,
      softDelete: async () => 'tombstoned',
      purge: async () => 'purged',
    },
    trips: { get: async (id) => id === trip.id ? trip : undefined },
    dayCreator: { createTripDay: async () => day },
    now: () => '2026-08-25T13:00:00.000Z',
    newId: () => `id-${++idSequence}`,
  })

  return { application, categoryCalls, dayCalls, templates, trip, day }
}

test('day template creation uses category and day scoped queries', async () => {
  const fixture = createFixture()

  const created = await fixture.application.createPersonalDayTemplate(
    fixture.trip.id,
    fixture.day.id,
    { name: 'La mia giornata' },
  )

  assert.equal(created.category, 'day')
  assert.deepEqual(created.definition.blocks.map((block) => block.content.text), ['Passeggiata', 'Pomeriggio'])
  assert.deepEqual(fixture.dayCalls, [fixture.day.id])
  assert.ok(fixture.categoryCalls.length >= 2)
  assert.ok(fixture.categoryCalls.every((call) => call.category === 'day'))
  assert.equal(fixture.categoryCalls[0]?.includeDeleted, true)
})

test('day template listing never requests unrelated template categories', async () => {
  const fixture = createFixture()

  const templates = await fixture.application.listDayTemplates()

  assert.equal(templates.length, 4)
  assert.ok(fixture.categoryCalls.length >= 2)
  assert.ok(fixture.categoryCalls.every((call) => call.category === 'day'))
  assert.deepEqual(fixture.dayCalls, [])
})
