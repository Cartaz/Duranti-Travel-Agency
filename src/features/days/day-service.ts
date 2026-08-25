import { dayApplication } from '../../composition/days'
import type { DayDraft } from '../../application/days/day-application'

export type { DayDraft }

// S1 compatibility seam for existing day/planner consumers. Keep this facade thin while
// UI consumers move to ApplicationProvider and planner gets its own application boundary.
export const listTripDays = dayApplication.listTripDays
export const getTripDay = dayApplication.getTripDay
export const createTripDay = dayApplication.createTripDay
export const updateTripDay = dayApplication.updateTripDay
