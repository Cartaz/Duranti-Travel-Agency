import type { TripStatus } from '../../domain/entities'
import type { TravelBookApplicationDependencies } from './ports'

export interface TravelBookChapter {
  id: string
  dayId: string
  sequence: number
  date: string
  title?: string
  summary?: string
  journalText?: string
}

export interface TravelBook {
  tripId: string
  title: string
  subtitle?: string
  status: TripStatus
  startDate?: string
  endDate?: string
  chapters: TravelBookChapter[]
}

export interface TravelBookApplication {
  loadTravelBook(tripId: string): Promise<TravelBook>
}

export function createTravelBookApplication(deps: TravelBookApplicationDependencies): TravelBookApplication {
  return {
    async loadTravelBook(tripId: string): Promise<TravelBook> {
      const trip = await deps.trips.getTrip(tripId)
      if (!trip) throw new Error('Il viaggio non esiste o è stato eliminato.')

      const days = await deps.days.listTripDays(tripId)
      const chapters = [...days]
        .sort((left, right) => left.sequence - right.sequence || left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
        .map((day) => ({
          id: `day:${day.id}`,
          dayId: day.id,
          sequence: day.sequence,
          date: day.date,
          title: day.title,
          summary: day.summary,
          journalText: day.journalText,
        }))

      return {
        tripId: trip.id,
        title: trip.title,
        subtitle: trip.subtitle,
        status: trip.status,
        startDate: trip.startDate,
        endDate: trip.endDate,
        chapters,
      }
    },
  }
}
