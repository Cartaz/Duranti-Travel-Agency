import { tripApplication } from '../../composition/trips'

// S1 strangler bridge: downstream features still validate their parent trip through this
// read-only seam. Do not add mutations here; migrate consumers to application ports instead.
export const getTrip = tripApplication.getTrip
