import { tripApplication } from '../../composition/trips'
import type { EditableTripStatus, TripDraft } from '../../application/trips/trip-application'

export type { EditableTripStatus, TripDraft }

export const listBookTrips = tripApplication.listBookTrips
export const listArchivedTrips = tripApplication.listArchivedTrips
export const getTrip = tripApplication.getTrip
export const createTrip = tripApplication.createTrip
export const updateTrip = tripApplication.updateTrip
export const archiveTrip = tripApplication.archiveTrip
export const restoreArchivedTrip = tripApplication.restoreArchivedTrip
