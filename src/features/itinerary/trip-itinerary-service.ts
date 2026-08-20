import type { Day } from '../../domain/entities'
import { listTripDays } from '../days/day-service'
import { listDayItineraryItems, type DayItineraryItem } from './itinerary-service'

export interface TripItineraryDay {
  day: Day
  items: DayItineraryItem[]
}

export interface TripItineraryOverview {
  days: TripItineraryDay[]
  stopCount: number
  warningCount: number
}

function hasSourceReference(item: DayItineraryItem): boolean {
  return Boolean(item.itinerary.reservationId || item.itinerary.blockId)
}

function needsAttention(item: DayItineraryItem): boolean {
  if (item.syncState === 'needs-sync' || item.syncState === 'orphaned') return true
  return item.source === 'manual' && hasSourceReference(item)
}

export async function listTripItineraryOverview(tripId: string): Promise<TripItineraryOverview> {
  const days = await listTripDays(tripId)
  const itineraryDays = await Promise.all(days.map(async (day) => ({
    day,
    items: await listDayItineraryItems(tripId, day.id),
  })))

  return {
    days: itineraryDays,
    stopCount: itineraryDays.reduce((total, section) => total + section.items.length, 0),
    warningCount: itineraryDays.reduce(
      (total, section) => total + section.items.filter(needsAttention).length,
      0,
    ),
  }
}
