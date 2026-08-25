import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'
import { plannerBlockRepository } from './block-repository'
import { dayRepository } from './day-repository'
import { expenseRepository } from './expense-repository'
import { itineraryRepository } from './itinerary-repository'
import { mediaFileRepository } from './media-repository'
import { reservationRepository } from './reservation-repository'
import { tripRepository } from './trip-repository'
import { tripTravelerRepository } from './trip-traveler-repository'
import { secureTravelerDocumentRepository } from './traveler-document-repository'
import type { DatabaseTables } from '../db/schema'

export { tripRepository }
export const travelerRepository = new Repository<DatabaseTables['travelers']>(db.travelers)
export const travelerDocumentRepository = secureTravelerDocumentRepository
export { tripTravelerRepository }
export { dayRepository }
export const blockRepository = plannerBlockRepository
export const placeRepository = new Repository<DatabaseTables['places']>(db.places)
export const mediaRepository = mediaFileRepository
export const linkRepository = new Repository<DatabaseTables['links']>(db.links)
export { itineraryRepository }
export const templateRepository = new Repository<DatabaseTables['templates']>(db.templates)
export { expenseRepository }
export { reservationRepository }
export const auditRepository = new Repository<DatabaseTables['auditLog']>(db.auditLog)
