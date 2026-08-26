import test from 'node:test'
import assert from 'node:assert/strict'
import type { Place } from '../../src/domain/entities.ts'
import type { ReservationDraft } from '../../src/application/reservations/reservation-application.ts'
import { selectSavedPlaceForReservation } from '../../src/application/reservations/reservation-place-selection.ts'

const emptyDraft: ReservationDraft = { title: '', status: 'planned' }

const place: Place = {
  id: 'place-1',
  name: 'Trattoria Mario',
  formattedAddress: 'Via Rosina 2r, Firenze',
  phone: '+39 055 218550',
  openingHours: 'Mo-Sa 12:00-15:30',
  createdAt: '2026-08-27T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z',
}

test('restaurant selection links the canonical place and initializes an empty title', () => {
  const next = selectSavedPlaceForReservation(emptyDraft, place, 'restaurant')

  assert.equal(next.placeId, place.id)
  assert.equal(next.title, place.name)
  assert.equal('formattedAddress' in next, false)
  assert.equal('phone' in next, false)
  assert.equal('openingHours' in next, false)
})

test('restaurant selection preserves a title already authored by the user', () => {
  const next = selectSavedPlaceForReservation(
    { ...emptyDraft, title: 'Cena di anniversario' },
    place,
    'restaurant',
  )

  assert.equal(next.placeId, place.id)
  assert.equal(next.title, 'Cena di anniversario')
})

test('non-restaurant reservations link the place without inventing a title', () => {
  const next = selectSavedPlaceForReservation(emptyDraft, place, 'activity')

  assert.equal(next.placeId, place.id)
  assert.equal(next.title, '')
})
