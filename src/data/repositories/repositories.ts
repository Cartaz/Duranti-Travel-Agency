import { db } from '../db/duranti-db'
import { Repository } from './base-repository'
import { mediaFileRepository } from './media-repository'
import type { DatabaseTables } from '../db/schema'

export const tripRepository = new Repository<DatabaseTables['trips']>(db.trips)
export const travelerRepository = new Repository<DatabaseTables['travelers']>(db.travelers)
export const travelerDocumentRepository = new Repository<DatabaseTables['travelerDocuments']>(db.travelerDocuments)
export const tripTravelerRepository = new Repository<DatabaseTables['tripTravelers']>(db.tripTravelers)
export const dayRepository = new Repository<DatabaseTables['days']>(db.days)
export const blockRepository = new Repository<DatabaseTables['blocks']>(db.blocks)
export const placeRepository = new Repository<DatabaseTables['places']>(db.places)
export const mediaRepository = mediaFileRepository
export const linkRepository = new Repository<DatabaseTables['links']>(db.links)
export const itineraryRepository = new Repository<DatabaseTables['itineraries']>(db.itineraries)
export const templateRepository = new Repository<DatabaseTables['templates']>(db.templates)
export const expenseRepository = new Repository<DatabaseTables['expenses']>(db.expenses)
export const reservationRepository = new Repository<DatabaseTables['reservations']>(db.reservations)
export const auditRepository = new Repository<DatabaseTables['auditLog']>(db.auditLog)
