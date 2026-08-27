import type { Media, TripStatus } from '../../domain/entities'
import type { TravelBookApplicationDependencies } from './ports'

export interface TravelBookMedia {
  id: string
  kind: 'image' | 'video'
  mimeType: string
  originalName?: string
  caption?: string
}

export interface TravelBookChapter {
  id: string
  dayId: string
  sequence: number
  date: string
  title?: string
  summary?: string
  journalText?: string
  media: TravelBookMedia[]
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
  readChapterMedia(tripId: string, dayId: string, mediaId: string): Promise<File>
}

function toTravelBookMedia(media: Media): TravelBookMedia {
  if (media.kind !== 'image' && media.kind !== 'video') throw new Error('Il media non è supportato dal libro di viaggio.')
  return {
    id: media.id,
    kind: media.kind,
    mimeType: media.mimeType,
    originalName: media.originalName,
    caption: media.caption,
  }
}

export function createTravelBookApplication(deps: TravelBookApplicationDependencies): TravelBookApplication {
  async function loadTravelBook(tripId: string): Promise<TravelBook> {
    const trip = await deps.trips.getTrip(tripId)
    if (!trip) throw new Error('Il viaggio non esiste o è stato eliminato.')

    const days = [...await deps.days.listTripDays(tripId)]
      .sort((left, right) => left.sequence - right.sequence || left.date.localeCompare(right.date) || left.id.localeCompare(right.id))

    const chapterMedia = await Promise.all(days.map((day) => deps.media.listDayMedia(tripId, day.id)))
    const chapters = days.map((day, index) => ({
      id: `day:${day.id}`,
      dayId: day.id,
      sequence: day.sequence,
      date: day.date,
      title: day.title,
      summary: day.summary,
      journalText: day.journalText,
      media: chapterMedia[index].map(toTravelBookMedia),
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
  }

  async function readChapterMedia(tripId: string, dayId: string, mediaId: string): Promise<File> {
    const dayMedia = await deps.media.listDayMedia(tripId, dayId)
    const media = dayMedia.find((candidate) => candidate.id === mediaId)
    if (!media) throw new Error('Il media non appartiene a questo capitolo del libro.')
    return deps.media.readMediaFile(media.id)
  }

  return { loadTravelBook, readChapterMedia }
}
