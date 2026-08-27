import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlannerApplication } from '../../src/application/planner/planner-application.ts'
import type { Block, Day, Trip } from '../../src/domain/entities.ts'

const timestamp = '2026-08-25T12:00:00.000Z'

function createFixture() {
  const trip: Trip = {
    id: 'trip-1',
    title: 'Strategic planner trip',
    status: 'planned',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const day: Day = {
    id: 'day-1',
    tripId: trip.id,
    sequence: 1,
    date: '2026-09-01',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const blocks: Block[] = [
    {
      id: 'block-later',
      tripId: trip.id,
      dayId: day.id,
      type: 'text',
      position: 3,
      content: { text: 'Later' },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'block-earlier',
      tripId: trip.id,
      dayId: day.id,
      type: 'heading',
      position: 1,
      content: { text: 'Earlier' },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'block-foreign',
      tripId: 'trip-2',
      dayId: day.id,
      type: 'text',
      position: 99,
      content: { text: 'Corrupt cross-trip row' },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]
  return { trip, day, blocks }
}

test('planner lists blocks through the semantic day query and keeps trip isolation', async () => {
  const { trip, day, blocks } = createFixture()
  const queriedDayIds: string[] = []

  const application = createPlannerApplication({
    blocks: {
      listByDay: async (dayId) => {
        queriedDayIds.push(dayId)
        return blocks
      },
      get: async () => undefined,
      put: async () => undefined,
      appendToDay: async (value) => ({ ...value, position: 1 }),
      softDelete: async () => 'not-found',
      moveWithinDay: async () => 'boundary',
    },
    trips: { getTrip: async (tripId) => tripId === trip.id ? trip : undefined },
    days: { getTripDay: async (tripId, dayId) => tripId === trip.id && dayId === day.id ? day : undefined },
    now: () => timestamp,
    newId: () => 'new-block',
  })

  const listed = await application.listDayPlannerBlocks(trip.id, day.id)

  assert.deepEqual(queriedDayIds, [day.id])
  assert.deepEqual(listed.map((block) => block.id), ['block-earlier', 'block-later'])
})

test('planner delegates new position allocation to the transactional append port', async () => {
  const { trip, day, blocks } = createFixture()
  let appendedWithoutPosition: Omit<Block, 'position'> | undefined
  let putCalls = 0

  const application = createPlannerApplication({
    blocks: {
      listByDay: async () => { throw new Error('create must not pre-read siblings') },
      get: async () => undefined,
      put: async () => { putCalls += 1 },
      appendToDay: async (value) => {
        appendedWithoutPosition = value
        const localSiblings = blocks.filter((block) => block.tripId === trip.id && block.dayId === day.id)
        const position = localSiblings.reduce((maximum, block) => Math.max(maximum, block.position), 0) + 1
        return { ...value, position }
      },
      softDelete: async () => 'not-found',
      moveWithinDay: async () => 'boundary',
    },
    trips: { getTrip: async (tripId) => tripId === trip.id ? trip : undefined },
    days: { getTripDay: async (tripId, dayId) => tripId === trip.id && dayId === day.id ? day : undefined },
    now: () => '2026-08-25T13:00:00.000Z',
    newId: () => 'block-new',
  })

  const created = await application.createPlannerBlock(trip.id, day.id, 'divider')

  assert.equal(created.position, 4)
  assert.equal(appendedWithoutPosition?.id, created.id)
  assert.equal(putCalls, 0)
})

test('planner generic delete refuses blocks whose linked data needs a transactional delete', async () => {
  const { trip, day } = createFixture()
  const expenseBlock: Block = {
    id: 'expense-block',
    tripId: trip.id,
    dayId: day.id,
    type: 'expense',
    position: 1,
    content: { expenseId: 'expense-1' },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  let softDeleteCalls = 0

  const application = createPlannerApplication({
    blocks: {
      listByDay: async () => [expenseBlock],
      get: async (blockId) => blockId === expenseBlock.id ? expenseBlock : undefined,
      put: async () => undefined,
      appendToDay: async (value) => ({ ...value, position: 1 }),
      softDelete: async () => { softDeleteCalls += 1; return 'tombstoned' },
      moveWithinDay: async () => 'boundary',
    },
    trips: { getTrip: async (tripId) => tripId === trip.id ? trip : undefined },
    days: { getTripDay: async (tripId, dayId) => tripId === trip.id && dayId === day.id ? day : undefined },
    now: () => timestamp,
    newId: () => 'new-block',
  })

  await assert.rejects(
    application.deletePlannerBlock(trip.id, day.id, expenseBlock.id),
    /editor dedicato/,
  )
  assert.equal(softDeleteCalls, 0)
})

test('planner generic delete still tombstones standalone blocks', async () => {
  const { trip, day } = createFixture()
  const textBlock: Block = {
    id: 'text-block',
    tripId: trip.id,
    dayId: day.id,
    type: 'text',
    position: 1,
    content: { text: 'Standalone' },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const deletedIds: string[] = []

  const application = createPlannerApplication({
    blocks: {
      listByDay: async () => [textBlock],
      get: async (blockId) => blockId === textBlock.id ? textBlock : undefined,
      put: async () => undefined,
      appendToDay: async (value) => ({ ...value, position: 1 }),
      softDelete: async (blockId) => { deletedIds.push(blockId); return 'tombstoned' },
      moveWithinDay: async () => 'boundary',
    },
    trips: { getTrip: async (tripId) => tripId === trip.id ? trip : undefined },
    days: { getTripDay: async (tripId, dayId) => tripId === trip.id && dayId === day.id ? day : undefined },
    now: () => timestamp,
    newId: () => 'new-block',
  })

  await application.deletePlannerBlock(trip.id, day.id, textBlock.id)

  assert.deepEqual(deletedIds, [textBlock.id])
})
