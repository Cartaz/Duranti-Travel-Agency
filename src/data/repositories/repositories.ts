import { db } from '../db/dtagency-db'
import { Repository } from './base-repository'
import { plannerBlockRepository } from './block-repository'
import { dayRepository } from './day-repository'
import { expenseRepository } from './expense-repository'
import { itineraryRepository } from './itinerary-repository'
import { mediaFileRepository } from './media-repository'
import { placeRepository } from './place-repository'
import { reservationRepository } from './reservation-repository'
import { templateRepository } from './template-repository'
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
export { placeRepository }
export const mediaRepository = mediaFileRepository
export const linkRepository = new Repository<DatabaseTables['links']>(db.links)
export { itineraryRepository }
export { templateRepository }
export { expenseRepository }
export { reservationRepository }
export const auditRepository = new Repository<DatabaseTables['auditLog']>(db.auditLog)
