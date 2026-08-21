import type { Media } from '../../domain/entities'
import { mediaRepository } from '../../data/repositories/repositories'
import { getTripDay } from '../days/day-service'
import { getTrip } from '../trips/trip-service'

export const DAY_MEDIA_ACCEPT = 'image/*,video/*'
export const MAX_DAY_IMAGE_BYTES = 25 * 1024 * 1024
export const MAX_DAY_VIDEO_BYTES = 250 * 1024 * 1024
export const MAX_DAY_MEDIA_CAPTION_LENGTH = 500

function mediaKind(file: File): Extract<Media['kind'], 'image' | 'video'> {
  const type = file.type.trim().toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  throw new Error('Formato non supportato. Seleziona una foto o un video.')
}

function validateFile(file: File): { kind: 'image' | 'video'; originalName: string } {
  if (file.size <= 0) throw new Error('Il file selezionato è vuoto.')
  const kind = mediaKind(file)
  const maximum = kind === 'image' ? MAX_DAY_IMAGE_BYTES : MAX_DAY_VIDEO_BYTES
  if (file.size > maximum) {
    throw new Error(kind === 'image'
      ? 'La foto supera il limite di 25 MiB.'
      : 'Il video supera il limite di 250 MiB.')
  }

  const originalName = file.name.trim()
  if (!originalName) throw new Error('Il file deve avere un nome.')
  if (originalName.length > 255) throw new Error('Il nome del file è troppo lungo.')
  return { kind, originalName }
}

async function assertDayContext(tripId: string, dayId: string, editable: boolean): Promise<void> {
  const [trip, day] = await Promise.all([getTrip(tripId), getTripDay(tripId, dayId)])
  if (!trip || !day) throw new Error('Viaggio o giornata non disponibili.')
  if (editable && trip.status === 'archived') {
    throw new Error('Ripristina il viaggio prima di modificare foto e video.')
  }
}

export async function listDayMedia(tripId: string, dayId: string): Promise<Media[]> {
  await assertDayContext(tripId, dayId, false)
  return mediaRepository.listForDay(tripId, dayId)
}

export async function importDayMedia(tripId: string, dayId: string, file: File): Promise<Media> {
  await assertDayContext(tripId, dayId, true)
  const descriptor = validateFile(file)
  return mediaRepository.create({
    tripId,
    dayId,
    kind: descriptor.kind,
    mimeType: file.type,
    originalName: descriptor.originalName,
  }, file)
}

export async function readDayMedia(media: Media, tripId: string, dayId: string): Promise<File> {
  if (media.tripId !== tripId || media.dayId !== dayId || (media.kind !== 'image' && media.kind !== 'video')) {
    throw new Error('Il file non appartiene a questa giornata.')
  }
  return mediaRepository.getFile(media.id)
}

export async function updateDayMediaCaption(
  tripId: string,
  dayId: string,
  mediaId: string,
  caption: string,
): Promise<Media> {
  await assertDayContext(tripId, dayId, true)
  const media = await mediaRepository.get(mediaId)
  if (!media || media.tripId !== tripId || media.dayId !== dayId) {
    throw new Error('La foto o il video non appartiene a questa giornata.')
  }
  if (caption.length > MAX_DAY_MEDIA_CAPTION_LENGTH) {
    throw new Error(`La didascalia può contenere al massimo ${MAX_DAY_MEDIA_CAPTION_LENGTH} caratteri.`)
  }
  return mediaRepository.updateCaption(mediaId, caption)
}

export async function removeDayMedia(tripId: string, dayId: string, mediaId: string): Promise<void> {
  await assertDayContext(tripId, dayId, true)
  const media = await mediaRepository.get(mediaId)
  if (!media || media.tripId !== tripId || media.dayId !== dayId) {
    throw new Error('La foto o il video non appartiene a questa giornata.')
  }

  await mediaRepository.softDelete(mediaId)
  try {
    await mediaRepository.purge(mediaId)
  } catch {
    // The tombstone keeps the file hidden; physical cleanup can be retried later.
  }
}
