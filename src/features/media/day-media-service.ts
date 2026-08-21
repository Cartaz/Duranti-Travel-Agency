import type { Media, Place } from '../../domain/entities'
import { blockRepository, mediaRepository, placeRepository } from '../../data/repositories/repositories'
import { getTripDay } from '../days/day-service'
import { listDayItineraryItems } from '../itinerary/itinerary-service'
import { getTrip } from '../trips/trip-service'

export const DAY_MEDIA_ACCEPT = 'image/*,video/*'
export const MAX_DAY_IMAGE_BYTES = 25 * 1024 * 1024
export const MAX_DAY_VIDEO_BYTES = 250 * 1024 * 1024
export const MAX_DAY_MEDIA_CAPTION_LENGTH = 500

export interface DayMediaPlaceOption {
  id: string
  name: string
}

export interface DayMediaItineraryOption {
  key: string
  title: string
  placeName?: string
  itineraryId?: string
  reservationId?: string
}

export interface DayMediaContextOptions {
  places: DayMediaPlaceOption[]
  itineraries: DayMediaItineraryOption[]
}

export interface DayMediaDetailsDraft {
  caption: string
  placeId?: string
  itineraryKey?: string
}

export type DayMediaMoveDirection = 'up' | 'down'

const mimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

function kindForMime(mimeType: string | undefined): 'image' | 'video' | undefined {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  return undefined
}

function mediaDescriptor(file: File): { kind: 'image' | 'video'; mimeType: string; originalName: string } {
  if (file.size <= 0) throw new Error('Il file selezionato è vuoto.')

  const originalName = file.name.trim()
  if (!originalName) throw new Error('Il file deve avere un nome.')
  if (originalName.length > 255) throw new Error('Il nome del file è troppo lungo.')

  const extension = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : ''
  const extensionMime = mimeByExtension[extension]
  const declaredMime = file.type.trim().toLowerCase().split(';')[0]
  const declaredKind = kindForMime(declaredMime)
  const extensionKind = kindForMime(extensionMime)

  if (declaredKind && extensionKind && declaredKind !== extensionKind) {
    throw new Error('Il tipo del file non corrisponde alla sua estensione.')
  }

  const mimeType = declaredKind ? declaredMime : extensionMime
  const kind = kindForMime(mimeType)
  if (!kind || !mimeType) throw new Error('Formato non supportato. Seleziona una foto o un video.')

  const maximum = kind === 'image' ? MAX_DAY_IMAGE_BYTES : MAX_DAY_VIDEO_BYTES
  if (file.size > maximum) {
    throw new Error(kind === 'image'
      ? 'La foto supera il limite di 25 MiB.'
      : 'Il video supera il limite di 250 MiB.')
  }

  return { kind, mimeType, originalName }
}

async function assertDayContext(tripId: string, dayId: string, editable: boolean): Promise<void> {
  const [trip, day] = await Promise.all([getTrip(tripId), getTripDay(tripId, dayId)])
  if (!trip || !day) throw new Error('Viaggio o giornata non disponibili.')
  if (editable && trip.status === 'archived') {
    throw new Error('Ripristina il viaggio prima di modificare foto e video.')
  }
}

function placeIdFromBlockContent(content: Record<string, unknown>): string | undefined {
  return typeof content.placeId === 'string' && content.placeId ? content.placeId : undefined
}

function itineraryOptionKey(reservationId: string | undefined, itineraryId: string): string {
  return reservationId ? `reservation:${reservationId}` : `itinerary:${itineraryId}`
}

export function dayMediaItineraryKey(media: Media): string {
  if (media.reservationId) return `reservation:${media.reservationId}`
  if (media.itineraryId) return `itinerary:${media.itineraryId}`
  return ''
}

export async function listDayMedia(tripId: string, dayId: string): Promise<Media[]> {
  await assertDayContext(tripId, dayId, false)
  return mediaRepository.listForDay(tripId, dayId)
}

export async function listDayMediaContext(tripId: string, dayId: string): Promise<DayMediaContextOptions> {
  await assertDayContext(tripId, dayId, false)
  const [blocks, places, itineraryItems] = await Promise.all([
    blockRepository.list().then((items) => items.filter((item) => (
      item.tripId === tripId && item.dayId === dayId && item.type === 'place'
    ))),
    placeRepository.list(),
    listDayItineraryItems(tripId, dayId),
  ])

  const placeById = new Map<string, Place>(places.map((place) => [place.id, place]))
  const dayPlaceIds = new Set<string>()
  for (const block of blocks) {
    const placeId = placeIdFromBlockContent(block.content)
    if (placeId) dayPlaceIds.add(placeId)
  }
  for (const item of itineraryItems) {
    if (item.itinerary.placeId) dayPlaceIds.add(item.itinerary.placeId)
  }

  const placeOptions = [...dayPlaceIds]
    .map((id) => placeById.get(id))
    .filter((place): place is Place => Boolean(place))
    .sort((left, right) => left.name.localeCompare(right.name, 'it'))
    .map((place) => ({ id: place.id, name: place.name }))

  const itineraryOptionsByKey = new Map<string, DayMediaItineraryOption>()
  for (const item of itineraryItems) {
    const reservationId = item.itinerary.reservationId
    const key = itineraryOptionKey(reservationId, item.itinerary.id)
    if (itineraryOptionsByKey.has(key)) continue
    itineraryOptionsByKey.set(key, {
      key,
      title: item.itinerary.title,
      placeName: item.place?.name,
      itineraryId: reservationId ? undefined : item.itinerary.id,
      reservationId,
    })
  }

  return {
    places: placeOptions,
    itineraries: [...itineraryOptionsByKey.values()],
  }
}

export async function importDayMedia(tripId: string, dayId: string, file: File): Promise<Media> {
  await assertDayContext(tripId, dayId, true)
  const descriptor = mediaDescriptor(file)
  return mediaRepository.create({
    tripId,
    dayId,
    kind: descriptor.kind,
    mimeType: descriptor.mimeType,
    originalName: descriptor.originalName,
  }, file)
}

export async function readDayMedia(media: Media, tripId: string, dayId: string): Promise<File> {
  if (media.tripId !== tripId || media.dayId !== dayId || media.blockId || (media.kind !== 'image' && media.kind !== 'video')) {
    throw new Error('Il file non appartiene a questa giornata.')
  }
  return mediaRepository.getFile(media.id)
}

export async function updateDayMediaDetails(
  tripId: string,
  dayId: string,
  mediaId: string,
  input: DayMediaDetailsDraft,
): Promise<Media> {
  await assertDayContext(tripId, dayId, true)
  const media = await mediaRepository.get(mediaId)
  if (!media || media.tripId !== tripId || media.dayId !== dayId || media.blockId) {
    throw new Error('La foto o il video non appartiene a questa giornata.')
  }

  if (input.caption.length > MAX_DAY_MEDIA_CAPTION_LENGTH) {
    throw new Error(`La didascalia può contenere al massimo ${MAX_DAY_MEDIA_CAPTION_LENGTH} caratteri.`)
  }

  const placeId = input.placeId?.trim() || undefined
  if (placeId && !(await placeRepository.get(placeId))) {
    throw new Error('Il luogo collegato non esiste più.')
  }

  let itineraryId: string | undefined
  let reservationId: string | undefined
  const itineraryKey = input.itineraryKey?.trim() || undefined
  if (itineraryKey) {
    const context = await listDayMediaContext(tripId, dayId)
    const option = context.itineraries.find((candidate) => candidate.key === itineraryKey)
    if (option) {
      itineraryId = option.itineraryId
      reservationId = option.reservationId
    } else if (itineraryKey === dayMediaItineraryKey(media)) {
      itineraryId = media.itineraryId
      reservationId = media.reservationId
    } else {
      throw new Error('La tappa collegata non è più disponibile in questa giornata.')
    }
  }

  return mediaRepository.updateDayMetadata(mediaId, {
    caption: input.caption,
    placeId,
    itineraryId,
    reservationId,
  })
}

export async function updateDayMediaCaption(
  tripId: string,
  dayId: string,
  mediaId: string,
  caption: string,
): Promise<Media> {
  const media = await mediaRepository.get(mediaId)
  if (!media) throw new Error('La foto o il video non esiste più.')
  return updateDayMediaDetails(tripId, dayId, mediaId, {
    caption,
    placeId: media.placeId,
    itineraryKey: dayMediaItineraryKey(media),
  })
}

export async function moveDayMedia(
  tripId: string,
  dayId: string,
  mediaId: string,
  direction: DayMediaMoveDirection,
): Promise<void> {
  await assertDayContext(tripId, dayId, true)
  const items = await mediaRepository.listForDay(tripId, dayId)
  const index = items.findIndex((item) => item.id === mediaId)
  if (index < 0) throw new Error('La foto o il video non appartiene a questa giornata.')

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= items.length) return

  const orderedIds = items.map((item) => item.id)
  ;[orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]]
  await mediaRepository.setDayOrder(tripId, dayId, orderedIds)
}

export async function removeDayMedia(tripId: string, dayId: string, mediaId: string): Promise<void> {
  await assertDayContext(tripId, dayId, true)
  const media = await mediaRepository.get(mediaId)
  if (!media || media.tripId !== tripId || media.dayId !== dayId || media.blockId) {
    throw new Error('La foto o il video non appartiene a questa giornata.')
  }

  await mediaRepository.softDelete(mediaId)
  try {
    await mediaRepository.purge(mediaId)
  } catch {
    // The tombstone keeps the file hidden; physical cleanup can be retried later.
  }
}
