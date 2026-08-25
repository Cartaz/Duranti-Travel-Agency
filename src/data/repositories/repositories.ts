import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'
import { plannerBlockRepository } from './block-repository'
import { itineraryRepository } from './itinerary-repository'
import { mediaFileRepository } from './media-repository'
import { tripTravelerRepository } from './trip-traveler-repository'
import { secureTravelerDocumentRepository } from './traveler-document-repository'
import type { DatabaseTables } from '../db/schema'

export const tripRepository = new Repository<DatabaseTables['trips']>(db.trips)
export const travelerRepository = new Repository<DatabaseTables['travelers']>(db.travelers)
export const travelerDocumentRepository = secureTravelerDocumentRepository
export { tripTravelerRepository }
export const dayRepository = new Repository<DatabaseTables['days']>(db.days)
export const blockRepository = plannerBlockRepository
export const placeRepository = new Repository<DatabaseTables['places']>(db.places)
export const mediaRepository = mediaFileRepository
export const linkRepository = new Repository<DatabaseTables['links']>(db.links)
export { itineraryRepository }
export const templateRepository = new Repository<DatabaseTables['templates']>(db.templates)
export const expenseRepository = new Repository<DatabaseTables['expenses']>(db.expenses)
export const reservationRepository = new Repository<DatabaseTables['reservations']>(db.reservations)
export const auditRepository = new Repository<DatabaseTables['auditLog']>(db.auditLog)
