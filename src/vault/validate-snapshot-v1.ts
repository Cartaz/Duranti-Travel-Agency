import type { VaultTableSnapshot } from './format'

const TRIP_STATUSES = new Set(['planned', 'ongoing', 'completed', 'archived'])
const TRAVELER_DOCUMENT_TYPES = new Set(['passport', 'identityCard', 'drivingLicense', 'visa', 'other'])
const TRAVELER_ROLES = new Set(['owner', 'companion', 'child', 'other'])
const BLOCK_TYPES = new Set([
  'text', 'heading', 'checklist', 'place', 'map', 'media', 'link', 'quote', 'divider', 'table', 'expense',
  'transport', 'accommodation', 'restaurant', 'activity', 'document', 'weatherSnapshot',
])
const MEDIA_KINDS = new Set(['image', 'video', 'audio', 'document'])
const RESERVATION_TYPES = new Set(['accommodation', 'transport', 'restaurant', 'activity', 'other'])
const RESERVATION_STATUSES = new Set(['planned', 'booked', 'completed', 'cancelled'])
const ITINERARY_TYPES = new Set(['transport', 'activity', 'meal', 'reservation', 'free-time', 'custom'])
const ITINERARY_STATUSES = new Set(['idea', 'planned', 'booked', 'done', 'cancelled'])
const AUDIT_ACTIONS = new Set(['create', 'update', 'delete', 'restore', 'import', 'export'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(table: string, id: string, message: string): never {
  throw new Error(`Vault ${table} row ${id}: ${message}`)
}

function requireString(row: Record<string, unknown>, key: string, table: string, id: string, allowEmpty = false): string {
  const value = row[key]
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) fail(table, id, `${key} is invalid.`)
  return value
}

function optionalString(row: Record<string, unknown>, key: string, table: string, id: string): string | undefined {
  const value = row[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0) fail(table, id, `${key} is invalid.`)
  return value
}

function requireEnum(row: Record<string, unknown>, key: string, allowed: Set<string>, table: string, id: string): string {
  const value = requireString(row, key, table, id)
  if (!allowed.has(value)) fail(table, id, `${key} is unsupported.`)
  return value
}

function optionalEnum(row: Record<string, unknown>, key: string, allowed: Set<string>, table: string, id: string): string | undefined {
  const value = optionalString(row, key, table, id)
  if (value !== undefined && !allowed.has(value)) fail(table, id, `${key} is unsupported.`)
  return value
}

function requireSafeInteger(row: Record<string, unknown>, key: string, table: string, id: string, minimum = 0): number {
  const value = row[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail(table, id, `${key} is invalid.`)
  return value
}

function optionalSafeInteger(row: Record<string, unknown>, key: string, table: string, id: string, minimum = 0): number | undefined {
  const value = row[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail(table, id, `${key} is invalid.`)
  return value
}

function optionalFiniteNumber(row: Record<string, unknown>, key: string, table: string, id: string): number | undefined {
  const value = row[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(table, id, `${key} is invalid.`)
  return value
}

function isIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value.includes('T')
}

function requireEntityBase(row: Record<string, unknown>, table: string): string {
  const id = requireString(row, 'id', table, '<unknown>')
  const createdAt = requireString(row, 'createdAt', table, id)
  const updatedAt = requireString(row, 'updatedAt', table, id)
  if (!isIsoTimestamp(createdAt)) fail(table, id, 'createdAt is not a valid timestamp.')
  if (!isIsoTimestamp(updatedAt)) fail(table, id, 'updatedAt is not a valid timestamp.')
  const deletedAt = optionalString(row, 'deletedAt', table, id)
  if (deletedAt && !isIsoTimestamp(deletedAt)) fail(table, id, 'deletedAt is not a valid timestamp.')
  return id
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function optionalDateOnly(row: Record<string, unknown>, key: string, table: string, id: string): string | undefined {
  const value = optionalString(row, key, table, id)
  if (value !== undefined && !validDateOnly(value)) fail(table, id, `${key} is not a real calendar date.`)
  return value
}

function optionalCoordinates(row: Record<string, unknown>, latitudeKey: string, longitudeKey: string, table: string, id: string): void {
  const latitude = optionalFiniteNumber(row, latitudeKey, table, id)
  const longitude = optionalFiniteNumber(row, longitudeKey, table, id)
  if (latitude !== undefined && (latitude < -90 || latitude > 90)) fail(table, id, `${latitudeKey} is out of range.`)
  if (longitude !== undefined && (longitude < -180 || longitude > 180)) fail(table, id, `${longitudeKey} is out of range.`)
}

function validateEncryptedPayload(value: unknown, table: string, id: string): void {
  if (!isRecord(value)) fail(table, id, 'encryptedPayload is invalid.')
  if (
    value.version !== 1 || value.algorithm !== 'AES-GCM' || value.tagLength !== 128 ||
    typeof value.ivB64 !== 'string' || value.ivB64.length === 0 ||
    typeof value.ciphertextB64 !== 'string' || value.ciphertextB64.length === 0
  ) fail(table, id, 'encryptedPayload is not DTAgency encrypted payload v1.')
}

function validateTrip(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'trips')
  requireString(row, 'title', 'trips', id)
  requireEnum(row, 'status', TRIP_STATUSES, 'trips', id)
  const archivedFromStatus = optionalString(row, 'archivedFromStatus', 'trips', id)
  if (archivedFromStatus && !['planned', 'ongoing', 'completed'].includes(archivedFromStatus)) fail('trips', id, 'archivedFromStatus is unsupported.')
  const start = optionalDateOnly(row, 'startDate', 'trips', id)
  const end = optionalDateOnly(row, 'endDate', 'trips', id)
  if (start && end && end < start) fail('trips', id, 'endDate precedes startDate.')
  const currency = optionalString(row, 'currency', 'trips', id)
  if (currency && !/^[A-Z]{3}$/.test(currency)) fail('trips', id, 'currency is invalid.')
  optionalSafeInteger(row, 'budgetMinor', 'trips', id, 1)
  if (row.homeLocation !== undefined) {
    if (!isRecord(row.homeLocation)) fail('trips', id, 'homeLocation is invalid.')
    optionalCoordinates(row.homeLocation, 'latitude', 'longitude', 'trips', id)
  }
}

function validateTraveler(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'travelers')
  requireString(row, 'firstName', 'travelers', id)
  requireString(row, 'lastName', 'travelers', id)
  requireString(row, 'displayName', 'travelers', id)
  optionalDateOnly(row, 'birthDate', 'travelers', id)
  if (row.address !== undefined && !isRecord(row.address)) fail('travelers', id, 'address is invalid.')
}

function validateTravelerDocument(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'travelerDocuments')
  requireString(row, 'travelerId', 'travelerDocuments', id)
  requireEnum(row, 'type', TRAVELER_DOCUMENT_TYPES, 'travelerDocuments', id)
  validateEncryptedPayload(row.encryptedPayload, 'travelerDocuments', id)
}

function validateTripTraveler(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'tripTravelers')
  requireString(row, 'tripId', 'tripTravelers', id)
  requireString(row, 'travelerId', 'tripTravelers', id)
  optionalEnum(row, 'role', TRAVELER_ROLES, 'tripTravelers', id)
}

function validateDay(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'days')
  requireString(row, 'tripId', 'days', id)
  const date = requireString(row, 'date', 'days', id)
  if (!validDateOnly(date)) fail('days', id, 'date is not a real calendar date.')
  requireSafeInteger(row, 'sequence', 'days', id, 1)
}

function validateBlock(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'blocks')
  requireString(row, 'tripId', 'blocks', id)
  optionalString(row, 'dayId', 'blocks', id)
  optionalString(row, 'parentBlockId', 'blocks', id)
  requireEnum(row, 'type', BLOCK_TYPES, 'blocks', id)
  requireSafeInteger(row, 'position', 'blocks', id, 1)
  if (!isRecord(row.content)) fail('blocks', id, 'content is invalid.')
}

function validatePlace(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'places')
  requireString(row, 'name', 'places', id)
  optionalCoordinates(row, 'latitude', 'longitude', 'places', id)
  const countryCode = optionalString(row, 'countryCode', 'places', id)
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) fail('places', id, 'countryCode is invalid.')
}

function validateMedia(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'media')
  requireEnum(row, 'kind', MEDIA_KINDS, 'media', id)
  requireString(row, 'mimeType', 'media', id)
  requireSafeInteger(row, 'sizeBytes', 'media', id, 0)
  requireString(row, 'opfsPath', 'media', id)
  optionalSafeInteger(row, 'position', 'media', id, 1)
}

function validateLink(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'links')
  const url = requireString(row, 'url', 'links', id)
  try { new URL(url) } catch { fail('links', id, 'url is invalid.') }
}

function validateItinerary(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'itineraries')
  requireString(row, 'tripId', 'itineraries', id)
  optionalString(row, 'dayId', 'itineraries', id)
  requireString(row, 'title', 'itineraries', id)
  optionalEnum(row, 'type', ITINERARY_TYPES, 'itineraries', id)
  optionalEnum(row, 'status', ITINERARY_STATUSES, 'itineraries', id)
  optionalSafeInteger(row, 'position', 'itineraries', id, 1)
  const startsAt = optionalString(row, 'startsAt', 'itineraries', id)
  const endsAt = optionalString(row, 'endsAt', 'itineraries', id)
  if (startsAt && !Number.isFinite(Date.parse(startsAt))) fail('itineraries', id, 'startsAt is invalid.')
  if (endsAt && !Number.isFinite(Date.parse(endsAt))) fail('itineraries', id, 'endsAt is invalid.')
  if (startsAt && endsAt && endsAt < startsAt) fail('itineraries', id, 'endsAt precedes startsAt.')
}

function validateTemplate(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'templates')
  requireString(row, 'name', 'templates', id)
  requireString(row, 'category', 'templates', id)
  requireSafeInteger(row, 'version', 'templates', id, 1)
  if (!isRecord(row.definition) || !Array.isArray(row.definition.blocks)) fail('templates', id, 'definition is invalid.')
  for (const [index, block] of row.definition.blocks.entries()) {
    if (!isRecord(block)) fail('templates', id, `definition block ${index} is invalid.`)
    if (typeof block.type !== 'string' || !BLOCK_TYPES.has(block.type)) fail('templates', id, `definition block ${index} type is unsupported.`)
    if (!isRecord(block.content)) fail('templates', id, `definition block ${index} content is invalid.`)
    if (typeof block.position !== 'number' || !Number.isSafeInteger(block.position) || block.position < 1) fail('templates', id, `definition block ${index} position is invalid.`)
  }
}

function validateExpense(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'expenses')
  requireString(row, 'tripId', 'expenses', id)
  requireSafeInteger(row, 'amountMinor', 'expenses', id, 1)
  const currency = requireString(row, 'currency', 'expenses', id)
  if (!/^[A-Z]{3}$/.test(currency)) fail('expenses', id, 'currency is invalid.')
  if (row.fx !== undefined) {
    if (!isRecord(row.fx)) fail('expenses', id, 'fx is invalid.')
    const targetCurrency = requireString(row.fx, 'targetCurrency', 'expenses', id)
    if (!/^[A-Z]{3}$/.test(targetCurrency)) fail('expenses', id, 'fx targetCurrency is invalid.')
    requireString(row.fx, 'rate', 'expenses', id)
    requireSafeInteger(row.fx, 'convertedAmountMinor', 'expenses', id, 0)
  }
}

function validateReservation(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'reservations')
  requireString(row, 'tripId', 'reservations', id)
  requireEnum(row, 'type', RESERVATION_TYPES, 'reservations', id)
  requireString(row, 'title', 'reservations', id)
  optionalEnum(row, 'status', RESERVATION_STATUSES, 'reservations', id)
  const startsAt = optionalString(row, 'startsAt', 'reservations', id)
  const endsAt = optionalString(row, 'endsAt', 'reservations', id)
  if (startsAt && !Number.isFinite(Date.parse(startsAt))) fail('reservations', id, 'startsAt is invalid.')
  if (endsAt && !Number.isFinite(Date.parse(endsAt))) fail('reservations', id, 'endsAt is invalid.')
  if (startsAt && endsAt && endsAt < startsAt) fail('reservations', id, 'endsAt precedes startsAt.')
}

function validateAudit(row: Record<string, unknown>): void {
  const id = requireEntityBase(row, 'auditLog')
  requireString(row, 'entityType', 'auditLog', id)
  requireString(row, 'entityId', 'auditLog', id)
  requireEnum(row, 'action', AUDIT_ACTIONS, 'auditLog', id)
  const timestamp = requireString(row, 'timestamp', 'auditLog', id)
  if (!isIsoTimestamp(timestamp)) fail('auditLog', id, 'timestamp is invalid.')
}

function validateAppMeta(row: Record<string, unknown>): void {
  const key = requireString(row, 'key', 'appMeta', '<unknown>')
  if (!Object.hasOwn(row, 'value')) fail('appMeta', key, 'value is missing.')
}

const validators: Record<string, (row: Record<string, unknown>) => void> = {
  appMeta: validateAppMeta,
  auditLog: validateAudit,
  blocks: validateBlock,
  days: validateDay,
  expenses: validateExpense,
  itineraries: validateItinerary,
  links: validateLink,
  media: validateMedia,
  places: validatePlace,
  reservations: validateReservation,
  templates: validateTemplate,
  travelerDocuments: validateTravelerDocument,
  travelers: validateTraveler,
  trips: validateTrip,
  tripTravelers: validateTripTraveler,
}

function tableRows(tables: VaultTableSnapshot[], name: string): Record<string, unknown>[] {
  const table = tables.find((candidate) => candidate.name === name)
  if (!table) throw new Error(`Vault v1 semantic validation is missing table ${name}.`)
  return table.rows.map((row) => {
    if (!isRecord(row)) throw new Error(`Vault ${name} contains a non-object row.`)
    return row
  })
}

function ids(tables: VaultTableSnapshot[], name: string): Set<string> {
  return new Set(tableRows(tables, name).map((row) => String(row.id)))
}

function requireReference(
  row: Record<string, unknown>,
  key: string,
  targets: Set<string>,
  table: string,
  id: string,
): void {
  const value = row[key]
  if (typeof value !== 'string' || value.length === 0 || !targets.has(value)) fail(table, id, `${key} references a missing record.`)
}

function optionalReference(
  row: Record<string, unknown>,
  key: string,
  targets: Set<string>,
  table: string,
  id: string,
): void {
  const value = row[key]
  if (value === undefined) return
  if (typeof value !== 'string' || value.length === 0 || !targets.has(value)) fail(table, id, `${key} references a missing record.`)
}

function validateOwnershipGraph(tables: VaultTableSnapshot[]): void {
  const tripIds = ids(tables, 'trips')
  const travelerIds = ids(tables, 'travelers')
  const dayIds = ids(tables, 'days')
  const blockIds = ids(tables, 'blocks')
  const reservationIds = ids(tables, 'reservations')

  for (const row of tableRows(tables, 'travelerDocuments')) {
    requireReference(row, 'travelerId', travelerIds, 'travelerDocuments', String(row.id))
  }
  for (const row of tableRows(tables, 'tripTravelers')) {
    const id = String(row.id)
    requireReference(row, 'tripId', tripIds, 'tripTravelers', id)
    requireReference(row, 'travelerId', travelerIds, 'tripTravelers', id)
  }
  for (const row of tableRows(tables, 'days')) requireReference(row, 'tripId', tripIds, 'days', String(row.id))
  for (const row of tableRows(tables, 'blocks')) {
    const id = String(row.id)
    requireReference(row, 'tripId', tripIds, 'blocks', id)
    optionalReference(row, 'dayId', dayIds, 'blocks', id)
    optionalReference(row, 'parentBlockId', blockIds, 'blocks', id)
  }
  for (const table of ['expenses', 'reservations', 'itineraries'] as const) {
    for (const row of tableRows(tables, table)) {
      const id = String(row.id)
      requireReference(row, 'tripId', tripIds, table, id)
      optionalReference(row, 'dayId', dayIds, table, id)
    }
  }
  for (const row of tableRows(tables, 'itineraries')) {
    const id = String(row.id)
    optionalReference(row, 'blockId', blockIds, 'itineraries', id)
    optionalReference(row, 'reservationId', reservationIds, 'itineraries', id)
  }
}

export function validateVaultDatabaseSnapshotV1(tables: VaultTableSnapshot[]): void {
  const seenTables = new Set<string>()
  for (const table of tables) {
    if (seenTables.has(table.name)) throw new Error(`Vault v1 contains duplicate semantic table ${table.name}.`)
    seenTables.add(table.name)
    const validate = validators[table.name]
    if (!validate) throw new Error(`Vault v1 semantic validator does not support table ${table.name}.`)
    for (const row of tableRows(tables, table.name)) validate(row)
  }
  if (seenTables.size !== Object.keys(validators).length) throw new Error('Vault v1 semantic table inventory is incomplete.')
  validateOwnershipGraph(tables)
}
