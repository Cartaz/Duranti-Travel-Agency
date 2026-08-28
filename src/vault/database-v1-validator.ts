import type { VaultFileManifestEntry, VaultTableSnapshot } from './format'

type Row = Record<string, unknown>

const tripStatuses = new Set(['planned', 'ongoing', 'completed', 'archived'])
const travelerDocumentTypes = new Set(['passport', 'identityCard', 'drivingLicense', 'visa', 'other'])
const travelerRoles = new Set(['owner', 'companion', 'child', 'other'])
const blockTypes = new Set(['text', 'heading', 'checklist', 'place', 'map', 'media', 'link', 'quote', 'divider', 'table', 'expense', 'transport', 'accommodation', 'restaurant', 'activity', 'document', 'weatherSnapshot'])
const mediaKinds = new Set(['image', 'video', 'audio', 'document'])
const itineraryTypes = new Set(['transport', 'activity', 'meal', 'reservation', 'free-time', 'custom'])
const itineraryStatuses = new Set(['idea', 'planned', 'booked', 'done', 'cancelled'])
const reservationTypes = new Set(['accommodation', 'transport', 'restaurant', 'activity', 'other'])
const reservationStatuses = new Set(['planned', 'booked', 'completed', 'cancelled'])
const auditActions = new Set(['create', 'update', 'delete', 'restore', 'import', 'export'])

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(table: string, id: string, message: string): never {
  throw new Error(`Vault ${table} row ${id}: ${message}`)
}

function stringValue(row: Row, key: string, table: string, id: string): string {
  const value = row[key]
  if (typeof value !== 'string' || !value) fail(table, id, `${key} is missing or invalid.`)
  return value
}

function optionalString(row: Row, key: string, table: string, id: string): string | undefined {
  const value = row[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value) fail(table, id, `${key} is invalid.`)
  return value
}

function finiteNumber(row: Row, key: string, table: string, id: string, optional = false): number | undefined {
  const value = row[key]
  if (optional && value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(table, id, `${key} is invalid.`)
  return value
}

function safeInteger(row: Row, key: string, table: string, id: string, minimum = Number.MIN_SAFE_INTEGER, optional = false): number | undefined {
  const value = row[key]
  if (optional && value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail(table, id, `${key} is invalid.`)
  return value
}

function enumValue(row: Row, key: string, allowed: Set<string>, table: string, id: string, optional = false): string | undefined {
  const value = row[key]
  if (optional && value === undefined) return undefined
  if (typeof value !== 'string' || !allowed.has(value)) fail(table, id, `${key} is unsupported.`)
  return value
}

function assertIsoTimestamp(value: unknown, table: string, id: string, key: string, optional = false): void {
  if (optional && value === undefined) return
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) fail(table, id, `${key} is not a valid timestamp.`)
}

function assertDateOnly(value: unknown, table: string, id: string, key: string, optional = false): void {
  if (optional && value === undefined) return
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(table, id, `${key} is not a valid date.`)
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    fail(table, id, `${key} does not exist in the calendar.`)
  }
}

function assertLocalDateTime(value: unknown, table: string, id: string, key: string, optional = false): void {
  if (optional && value === undefined) return
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) fail(table, id, `${key} is not a valid local date/time.`)
  const [date, time] = value.split('T')
  assertDateOnly(date, table, id, key)
  const [hour, minute] = time.split(':').map(Number)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) fail(table, id, `${key} has an invalid clock time.`)
}

function assertEntityBase(row: Row, table: string): string {
  const id = stringValue(row, 'id', table, '<unknown>')
  assertIsoTimestamp(row.createdAt, table, id, 'createdAt')
  assertIsoTimestamp(row.updatedAt, table, id, 'updatedAt')
  assertIsoTimestamp(row.deletedAt, table, id, 'deletedAt', true)
  return id
}

function assertEncryptedPayload(value: unknown, table: string, id: string): void {
  if (!isRecord(value)) fail(table, id, 'encryptedPayload is invalid.')
  if (value.version !== 1 || value.algorithm !== 'AES-GCM' || value.tagLength !== 128) fail(table, id, 'encryptedPayload uses unsupported cryptographic metadata.')
  if (typeof value.ivB64 !== 'string' || !value.ivB64 || typeof value.ciphertextB64 !== 'string' || !value.ciphertextB64) {
    fail(table, id, 'encryptedPayload is incomplete.')
  }
}

function validateEntityRow(table: string, row: Row): void {
  const id = assertEntityBase(row, table)
  switch (table) {
    case 'trips': {
      stringValue(row, 'title', table, id)
      const status = enumValue(row, 'status', tripStatuses, table, id)
      assertDateOnly(row.startDate, table, id, 'startDate', true)
      assertDateOnly(row.endDate, table, id, 'endDate', true)
      const startDate = row.startDate as string | undefined
      const endDate = row.endDate as string | undefined
      if (startDate && endDate && endDate < startDate) fail(table, id, 'endDate precedes startDate.')
      if (row.archivedFromStatus !== undefined) {
        enumValue(row, 'archivedFromStatus', new Set(['planned', 'ongoing', 'completed']), table, id)
        if (status !== 'archived') fail(table, id, 'archivedFromStatus is only valid for archived trips.')
      }
      const budget = safeInteger(row, 'budgetMinor', table, id, 1, true)
      if (budget !== undefined && !optionalString(row, 'currency', table, id)) fail(table, id, 'budgetMinor requires currency.')
      if (row.currency !== undefined && !/^[A-Z]{3}$/.test(row.currency as string)) fail(table, id, 'currency is invalid.')
      break
    }
    case 'travelers':
      stringValue(row, 'firstName', table, id)
      stringValue(row, 'lastName', table, id)
      stringValue(row, 'displayName', table, id)
      assertDateOnly(row.birthDate, table, id, 'birthDate', true)
      break
    case 'travelerDocuments':
      stringValue(row, 'travelerId', table, id)
      enumValue(row, 'type', travelerDocumentTypes, table, id)
      assertEncryptedPayload(row.encryptedPayload, table, id)
      break
    case 'tripTravelers':
      stringValue(row, 'tripId', table, id)
      stringValue(row, 'travelerId', table, id)
      enumValue(row, 'role', travelerRoles, table, id, true)
      break
    case 'days':
      stringValue(row, 'tripId', table, id)
      assertDateOnly(row.date, table, id, 'date')
      safeInteger(row, 'sequence', table, id, 1)
      break
    case 'blocks':
      stringValue(row, 'tripId', table, id)
      optionalString(row, 'dayId', table, id)
      optionalString(row, 'parentBlockId', table, id)
      enumValue(row, 'type', blockTypes, table, id)
      safeInteger(row, 'position', table, id, 1)
      if (!isRecord(row.content)) fail(table, id, 'content is invalid.')
      break
    case 'places': {
      stringValue(row, 'name', table, id)
      const latitude = finiteNumber(row, 'latitude', table, id, true)
      const longitude = finiteNumber(row, 'longitude', table, id, true)
      if (latitude !== undefined && (latitude < -90 || latitude > 90)) fail(table, id, 'latitude is outside its valid range.')
      if (longitude !== undefined && (longitude < -180 || longitude > 180)) fail(table, id, 'longitude is outside its valid range.')
      break
    }
    case 'media':
      enumValue(row, 'kind', mediaKinds, table, id)
      stringValue(row, 'mimeType', table, id)
      stringValue(row, 'opfsPath', table, id)
      safeInteger(row, 'sizeBytes', table, id, 0)
      optionalString(row, 'tripId', table, id)
      optionalString(row, 'dayId', table, id)
      optionalString(row, 'blockId', table, id)
      optionalString(row, 'placeId', table, id)
      optionalString(row, 'itineraryId', table, id)
      optionalString(row, 'reservationId', table, id)
      safeInteger(row, 'position', table, id, 1, true)
      break
    case 'links':
      stringValue(row, 'url', table, id)
      optionalString(row, 'tripId', table, id)
      optionalString(row, 'dayId', table, id)
      optionalString(row, 'blockId', table, id)
      break
    case 'itineraries':
      stringValue(row, 'tripId', table, id)
      stringValue(row, 'title', table, id)
      optionalString(row, 'dayId', table, id)
      optionalString(row, 'placeId', table, id)
      optionalString(row, 'blockId', table, id)
      optionalString(row, 'reservationId', table, id)
      enumValue(row, 'type', itineraryTypes, table, id, true)
      enumValue(row, 'status', itineraryStatuses, table, id, true)
      assertLocalDateTime(row.startsAt, table, id, 'startsAt', true)
      assertLocalDateTime(row.endsAt, table, id, 'endsAt', true)
      if (row.startsAt && row.endsAt && (row.endsAt as string) < (row.startsAt as string)) fail(table, id, 'endsAt precedes startsAt.')
      safeInteger(row, 'position', table, id, 1, true)
      break
    case 'templates': {
      stringValue(row, 'name', table, id)
      stringValue(row, 'category', table, id)
      safeInteger(row, 'version', table, id, 1)
      if (!isRecord(row.definition) || !Array.isArray(row.definition.blocks)) fail(table, id, 'definition is invalid.')
      for (const [index, block] of row.definition.blocks.entries()) {
        if (!isRecord(block)) fail(table, id, `definition block ${index} is invalid.`)
        enumValue(block, 'type', blockTypes, table, id)
        safeInteger(block, 'position', table, id, 1)
        if (!isRecord(block.content)) fail(table, id, `definition block ${index} content is invalid.`)
      }
      break
    }
    case 'expenses':
      stringValue(row, 'tripId', table, id)
      safeInteger(row, 'amountMinor', table, id, 1)
      if (!/^[A-Z]{3}$/.test(stringValue(row, 'currency', table, id))) fail(table, id, 'currency is invalid.')
      optionalString(row, 'dayId', table, id)
      optionalString(row, 'paidByTravelerId', table, id)
      assertIsoTimestamp(row.occurredAt, table, id, 'occurredAt', true)
      break
    case 'reservations':
      stringValue(row, 'tripId', table, id)
      stringValue(row, 'title', table, id)
      enumValue(row, 'type', reservationTypes, table, id)
      enumValue(row, 'status', reservationStatuses, table, id, true)
      optionalString(row, 'dayId', table, id)
      optionalString(row, 'placeId', table, id)
      optionalString(row, 'attachmentMediaId', table, id)
      assertLocalDateTime(row.startsAt, table, id, 'startsAt', true)
      assertLocalDateTime(row.endsAt, table, id, 'endsAt', true)
      if (row.startsAt && row.endsAt && (row.endsAt as string) < (row.startsAt as string)) fail(table, id, 'endsAt precedes startsAt.')
      break
    case 'auditLog':
      stringValue(row, 'entityType', table, id)
      stringValue(row, 'entityId', table, id)
      enumValue(row, 'action', auditActions, table, id)
      assertIsoTimestamp(row.timestamp, table, id, 'timestamp')
      break
    default:
      fail(table, id, 'table is not supported by the DTAgency v1 semantic validator.')
  }
}

function rowsByTable(tables: VaultTableSnapshot[]): Map<string, Row[]> {
  const result = new Map<string, Row[]>()
  for (const table of tables) {
    if (table.name === 'appMeta') {
      for (const raw of table.rows) {
        if (!isRecord(raw) || typeof raw.key !== 'string' || !raw.key) throw new Error('Vault appMeta contains an invalid row.')
      }
      result.set(table.name, table.rows as Row[])
      continue
    }
    const rows = table.rows.map((raw) => {
      if (!isRecord(raw)) throw new Error(`Vault ${table.name} contains a non-object row.`)
      validateEntityRow(table.name, raw)
      return raw
    })
    result.set(table.name, rows)
  }
  return result
}

function indexed(rows: Row[] | undefined): Map<string, Row> {
  return new Map((rows ?? []).map((row) => [row.id as string, row]))
}

function requireReference(index: Map<string, Row>, id: unknown, table: string, rowId: string, field: string): Row | undefined {
  if (id === undefined) return undefined
  if (typeof id !== 'string' || !id) fail(table, rowId, `${field} is invalid.`)
  const target = index.get(id)
  if (!target) fail(table, rowId, `${field} references missing entity ${id}.`)
  return target
}

export function validateDatabaseV1Semantics(tables: VaultTableSnapshot[]): void {
  const rows = rowsByTable(tables)
  const trips = indexed(rows.get('trips'))
  const travelers = indexed(rows.get('travelers'))
  const documents = indexed(rows.get('travelerDocuments'))
  const memberships = indexed(rows.get('tripTravelers'))
  const days = indexed(rows.get('days'))
  const blocks = indexed(rows.get('blocks'))
  const places = indexed(rows.get('places'))
  const media = indexed(rows.get('media'))
  const itineraries = indexed(rows.get('itineraries'))
  const reservations = indexed(rows.get('reservations'))

  for (const document of documents.values()) requireReference(travelers, document.travelerId, 'travelerDocuments', document.id as string, 'travelerId')

  const activeMemberships = new Set<string>()
  for (const membership of memberships.values()) {
    const id = membership.id as string
    requireReference(trips, membership.tripId, 'tripTravelers', id, 'tripId')
    requireReference(travelers, membership.travelerId, 'tripTravelers', id, 'travelerId')
    if (!membership.deletedAt) {
      const key = `${membership.tripId}\u0000${membership.travelerId}`
      if (activeMemberships.has(key)) fail('tripTravelers', id, 'duplicates an active trip/traveler membership.')
      activeMemberships.add(key)
    }
  }

  const activeDaySequences = new Set<string>()
  for (const day of days.values()) {
    const id = day.id as string
    const trip = requireReference(trips, day.tripId, 'days', id, 'tripId')
    if (trip && !day.deletedAt) {
      const date = day.date as string
      const startDate = trip.startDate as string | undefined
      const endDate = trip.endDate as string | undefined
      if ((startDate && date < startDate) || (endDate && date > endDate)) fail('days', id, 'date is outside its trip range.')
      const sequenceKey = `${day.tripId}\u0000${day.sequence}`
      if (activeDaySequences.has(sequenceKey)) fail('days', id, 'duplicates an active day sequence in the same trip.')
      activeDaySequences.add(sequenceKey)
    }
  }

  const activeBlockPositions = new Set<string>()
  for (const block of blocks.values()) {
    const id = block.id as string
    requireReference(trips, block.tripId, 'blocks', id, 'tripId')
    const day = requireReference(days, block.dayId, 'blocks', id, 'dayId')
    if (day && day.tripId !== block.tripId) fail('blocks', id, 'dayId belongs to a different trip.')
    const parent = requireReference(blocks, block.parentBlockId, 'blocks', id, 'parentBlockId')
    if (parent && (parent.tripId !== block.tripId || parent.dayId !== block.dayId)) fail('blocks', id, 'parentBlockId belongs to a different context.')
    if (!block.deletedAt && block.dayId) {
      const key = `${block.dayId}\u0000${block.position}`
      if (activeBlockPositions.has(key)) fail('blocks', id, 'duplicates an active block position in the same day.')
      activeBlockPositions.add(key)
    }
  }

  for (const item of itineraries.values()) {
    const id = item.id as string
    requireReference(trips, item.tripId, 'itineraries', id, 'tripId')
    const day = requireReference(days, item.dayId, 'itineraries', id, 'dayId')
    if (day && day.tripId !== item.tripId) fail('itineraries', id, 'dayId belongs to a different trip.')
    const block = requireReference(blocks, item.blockId, 'itineraries', id, 'blockId')
    if (block && (block.tripId !== item.tripId || block.dayId !== item.dayId)) fail('itineraries', id, 'blockId belongs to a different context.')
    const reservation = requireReference(reservations, item.reservationId, 'itineraries', id, 'reservationId')
    if (reservation && (reservation.tripId !== item.tripId || reservation.dayId !== item.dayId)) fail('itineraries', id, 'reservationId belongs to a different context.')
    requireReference(places, item.placeId, 'itineraries', id, 'placeId')
  }

  for (const reservation of reservations.values()) {
    const id = reservation.id as string
    requireReference(trips, reservation.tripId, 'reservations', id, 'tripId')
    const day = requireReference(days, reservation.dayId, 'reservations', id, 'dayId')
    if (day && day.tripId !== reservation.tripId) fail('reservations', id, 'dayId belongs to a different trip.')
    requireReference(places, reservation.placeId, 'reservations', id, 'placeId')
    requireReference(media, reservation.attachmentMediaId, 'reservations', id, 'attachmentMediaId')
  }

  for (const expense of rows.get('expenses') ?? []) {
    const id = expense.id as string
    requireReference(trips, expense.tripId, 'expenses', id, 'tripId')
    const day = requireReference(days, expense.dayId, 'expenses', id, 'dayId')
    if (day && day.tripId !== expense.tripId) fail('expenses', id, 'dayId belongs to a different trip.')
    requireReference(travelers, expense.paidByTravelerId, 'expenses', id, 'paidByTravelerId')
  }

  for (const item of media.values()) {
    const id = item.id as string
    const trip = requireReference(trips, item.tripId, 'media', id, 'tripId')
    const day = requireReference(days, item.dayId, 'media', id, 'dayId')
    if (trip && day && day.tripId !== trip.id) fail('media', id, 'dayId belongs to a different trip.')
    const block = requireReference(blocks, item.blockId, 'media', id, 'blockId')
    if (block && item.tripId && block.tripId !== item.tripId) fail('media', id, 'blockId belongs to a different trip.')
    if (block && item.dayId && block.dayId !== item.dayId) fail('media', id, 'blockId belongs to a different day.')
    requireReference(places, item.placeId, 'media', id, 'placeId')
    requireReference(itineraries, item.itineraryId, 'media', id, 'itineraryId')
    requireReference(reservations, item.reservationId, 'media', id, 'reservationId')
  }

  for (const link of rows.get('links') ?? []) {
    const id = link.id as string
    const trip = requireReference(trips, link.tripId, 'links', id, 'tripId')
    const day = requireReference(days, link.dayId, 'links', id, 'dayId')
    if (trip && day && day.tripId !== trip.id) fail('links', id, 'dayId belongs to a different trip.')
    requireReference(blocks, link.blockId, 'links', id, 'blockId')
  }

  for (const trip of trips.values()) requireReference(media, trip.coverMediaId, 'trips', trip.id as string, 'coverMediaId')
}

export function validateActiveMediaFiles(tables: VaultTableSnapshot[], files: VaultFileManifestEntry[]): void {
  const mediaFiles = new Map(files.filter((file) => file.namespace === 'media').map((file) => [file.path, file]))
  const mediaTable = tables.find((table) => table.name === 'media')
  if (!mediaTable) throw new Error('Vault media table is missing.')

  for (const raw of mediaTable.rows) {
    if (!isRecord(raw) || raw.deletedAt) continue
    const id = typeof raw.id === 'string' ? raw.id : '<unknown>'
    const path = stringValue(raw, 'opfsPath', 'media', id)
    const file = mediaFiles.get(path)
    if (!file) fail('media', id, `active OPFS file ${path} is missing from the Vault manifest.`)
    if (file.sizeBytes !== raw.sizeBytes) fail('media', id, 'sizeBytes does not match the Vault file manifest.')
  }
}
